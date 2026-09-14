# -*- coding: utf-8 -*-
# ─────────────────────────────────────────────────────────────────────────────
# CUT02 「위층이 선다」 — 블렌더 사이클즈(GPU) 렌더
#
#   이 스크립트는 three.js 의 s7.html?shot=stop 과 «같은 장비»를 사이클즈 품질로
#   다시 뽑는다. 목표는 ASML·LAM 홍보 영상 같은 «묵직한 금속 + 얕은 심도 매크로».
#   결과물: 실행한 폴더에 result.png (1920×1080 스틸 한 장).
#
#   ⚠ 이 파일은 클라우드 세션이 아니라 «블렌더가 깔린 부장님 PC»에서 돈다.
#      블렌더 창을 열 필요 없다 — 아래 명령을 터미널에 붙여넣기만 하면 된다.
#
#   ▶ Windows (PowerShell 또는 cmd):
#       blender --background --python cut02_blender.py
#       (blender 가 안 잡히면 전체 경로:
#        "C:\Program Files\Blender Foundation\Blender 4.2\blender.exe" --background --python cut02_blender.py)
#
#   ▶ macOS (터미널):
#       /Applications/Blender.app/Contents/MacOS/Blender --background --python cut02_blender.py
#
#   렌더가 끝나면 이 스크립트를 실행한 «그 폴더»에 result.png 가 생긴다.
#   GPU(OptiX/CUDA/HIP/Metal)를 자동으로 잡고, 없으면 CPU 로 돈다(느릴 뿐 결과는 같다).
#
#   ⚠ 형상은 three.js 본과 «한 벌»이어야 한다(제2원칙 — 두 벌이면 같은 장비가 두 컷에서
#      다른 물건으로 보인다). 치수를 바꾸려면 s7.html 의 CUT02 블록과 «같이» 바꾼다.
# ─────────────────────────────────────────────────────────────────────────────
import bpy, bmesh, os, math, sys
from mathutils import Vector

# ── 좌표 규약 ────────────────────────────────────────────────────────────────
#   블렌더는 Z 가 위다(three.js 는 Y 가 위). 그래서 three.js (x,y,z) 를
#   블렌더 (x, z_depth, y_height) 로 눕힌다. 통로는 +Y 로 들어가고, 장비는
#   좌우(±X)에 서서 통로 가운데를 바라본다. 높이는 +Z.
N_PER_SIDE = 7
TOOL_W  = 1.50   # 외판 폭(통로 진행방향 = Y)
TOOL_H  = 2.30   # 높이(Z)
TOOL_T  = 0.12   # 두께(X)
AISLE_X = 1.05   # 통로 중심에서 외판 앞면까지
PITCH_Y = 1.35   # 장비 간격(깊이)
Y0      = 0.90   # 첫 장비의 깊이

def hexlin(h):
    """sRGB 16진 → 선형 RGB (사이클즈는 선형 입력이다)."""
    r = ((h>>16)&255)/255.0; g = ((h>>8)&255)/255.0; b = (h&255)/255.0
    f = lambda c: c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
    return (f(r), f(g), f(b), 1.0)

# ── 깨끗한 씬에서 시작 ────────────────────────────────────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ── 재질 헬퍼 ────────────────────────────────────────────────────────────────
def _set(bsdf, name, val):
    """소켓 이름이 블렌더 버전마다 다르다(4.0 에서 다수 개명) — 있으면만 넣는다."""
    if name in bsdf.inputs:
        bsdf.inputs[name].default_value = val
        return True
    return False

def pbr(name, color, metallic, roughness, aniso=0.0, coat=0.0, bump=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = color
    _set(b, "Metallic", metallic)
    _set(b, "Roughness", roughness)
    _set(b, "Anisotropic", aniso)
    # 클리어코트: 4.x 는 "Coat Weight", 3.x 는 "Clearcoat"
    if not _set(b, "Coat Weight", coat): _set(b, "Clearcoat", coat)
    if bump > 0:
        # 미세 브러시드 요철 — 매크로에서 «금속이 빛을 잘게 부순다». 텍스처 파일 없이
        # 노이즈로 만들어 어디서 돌려도 자족적이게 한다.
        tex = nt.nodes.new("ShaderNodeTexNoise"); tex.inputs["Scale"].default_value = 320.0
        tex.inputs["Detail"].default_value = 2.0
        bp = nt.nodes.new("ShaderNodeBump"); bp.inputs["Strength"].default_value = bump
        nt.links.new(tex.outputs["Fac"], bp.inputs["Height"])
        nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])
    return m

def emissive(name, color, strength):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    # 4.x: Emission Color + Emission Strength · 3.x: Emission
    if not _set(b, "Emission Color", color): _set(b, "Emission", color)
    _set(b, "Emission Strength", strength)
    _set(b, "Base Color", color)
    return m

MAT_PANEL = pbr("panel",  hexlin(0x9aa4b2), metallic=0.90, roughness=0.34, aniso=0.55, coat=0.15, bump=0.006)
MAT_DARK  = pbr("accent", hexlin(0x0e1218), metallic=0.70, roughness=0.55)          # 뷰포트·손잡이
MAT_SEAM  = pbr("seam",   hexlin(0x05070b), metallic=0.60, roughness=0.75)          # 패널 갭 바닥
MAT_FLOOR = pbr("floor",  hexlin(0x1b2027), metallic=0.10, roughness=0.22)          # 반사 있는 에폭시
MAT_G = emissive("led_g", hexlin(0x3bff6a), 8.0)
MAT_A = emissive("led_a", hexlin(0xffd23b), 8.0)
MAT_R = emissive("led_r", hexlin(0xff2f2f), 26.0)   # 비상 적색은 세게 — 이 컷의 «남는 빛»

# ── 상자 생성기(베벨 포함) ───────────────────────────────────────────────────
#   민짜 판은 어떤 조명으로도 골판지다. 모서리에 베벨을 주면 사이클즈가 거기서
#   가느다란 하이라이트를 만들어 «깎아 만든 금속»으로 읽힌다 — 이게 묵직함의 정체다.
def box(name, sx, sy, sz, loc, mat, bevel=0.006, segs=2):
    me = bpy.data.meshes.new(name); ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co.x*=sx; v.co.y*=sy; v.co.z*=sz
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:]+bm.verts[:], offset=bevel,
                        segments=segs, affect='EDGES', clamp_overlap=True)
    bm.to_mesh(me); bm.free()
    ob.location = Vector(loc)
    ob.data.materials.append(mat)
    for p in ob.data.polygons: p.use_smooth = False
    return ob

def cyl(name, r, h, loc, mat):
    me = bpy.data.meshes.new(name); ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=24,
        radius1=r, radius2=r, depth=h)
    bm.to_mesh(me); bm.free()
    ob.location = Vector(loc); ob.rotation_euler=(math.radians(90),0,0)  # 세워 세운다
    ob.data.materials.append(mat)
    return ob

# ── 장비 한 대 ───────────────────────────────────────────────────────────────
#   sd=+1 왼쪽 줄(면이 +X 를 본다) · sd=-1 오른쪽 줄(면이 -X). front = 통로 쪽 X.
def tool(idx, sd):
    y = Y0 + idx*PITCH_Y
    x = sd*AISLE_X
    front = x - sd*(TOOL_T/2)            # 외판 앞면(통로 쪽)
    fx = front + sd*0.001                # 악센트를 앞면에 살짝 띄운다
    # 외판
    box(f"face{sd}{idx}", TOOL_T, TOOL_W, TOOL_H, (x, y, TOOL_H/2+0.02), MAT_PANEL)
    # 패널 갭(가로 3 · 세로 4) — 얇고 깊은 홈을 어두운 상자로 판다
    for zz in (0.34, 1.15, 1.96):
        box(f"sh{sd}{idx}_{zz}", 0.010, TOOL_W-0.10, 0.016, (fx, y, zz+0.02), MAT_SEAM, bevel=0)
    for yy in (-0.55, -0.18, 0.18, 0.55):
        box(f"sv{sd}{idx}_{yy}", 0.010, 0.016, TOOL_H-0.14, (fx, y+yy, TOOL_H/2+0.02), MAT_SEAM, bevel=0)
    # 뷰포트(어두운 유리)
    box(f"vis{sd}{idx}", 0.030, 0.44, 0.30, (fx+sd*0.015, y-0.07, 1.64), MAT_DARK, bevel=0.004)
    # 손잡이 둘
    for hy in (0.62, 1.15):
        box(f"hd{sd}{idx}_{hy}", 0.05, 0.20, 0.028, (fx+sd*0.02, y+0.46, hy), MAT_DARK, bevel=0.004)
    # 3단 표시등 — 위에 세운다. 이 컷에서 앞 몇 대는 적색만, 뒤는 아직 녹색.
    #   앞(작은 idx)일수록 «먼저 꺼진» 상태 → 적색만. 뒤는 녹색이 남아 대비를 만든다.
    stopped = idx <= 2 + (0 if sd>0 else 1)
    for k,(mat_on, dz) in enumerate([(MAT_G,0.0),(MAT_A,0.062),(MAT_R,0.124)]):
        if stopped:
            mat = MAT_R if k==2 else emissive(f"off{sd}{idx}{k}", hexlin(0x0a0a0a), 0.0)
        else:
            mat = MAT_G if k==0 else emissive(f"dim{sd}{idx}{k}", hexlin(0x0a0a0a), 0.0)
        cyl(f"led{sd}{idx}{k}", 0.034, 0.056, (front+sd*0.05, y, 2.04+dz), mat)

for i in range(N_PER_SIDE):
    tool(i, +1); tool(i, -1)

# ── 바닥 ─────────────────────────────────────────────────────────────────────
box("floor", 30, 30, 0.04, (0, 6, -0.02), MAT_FLOOR, bevel=0)

# ── 조명 — 어두운 subfab. 채우지 않는다(참고본의 방식) ──────────────────────────
def area(name, color, power, loc, rot, size):
    l = bpy.data.lights.new(name, 'AREA'); l.energy=power; l.color=color; l.size=size
    ob = bpy.data.objects.new(name, l); ob.location=loc; ob.rotation_euler=rot
    bpy.context.collection.objects.link(ob); return ob

# 적색 키 — 비상등 쪽에서 통로로. area 라 GI 가 외판에 붉은 그라데이션을 만든다.
area("key_red",  (1.0,0.32,0.22), 900, (-3.2, 3.0, 2.4), (math.radians(62), 0, math.radians(-38)), 3.0)
# 찬 림 — 반대쪽에서 외판 «모서리»만 긋는다. 약하게.
area("rim_cool", (0.45,0.62,1.0), 420, ( 3.4, 5.6, 2.8), (math.radians(64), 0, math.radians(150)), 2.4)
# 아주 옅은 천장 채움 — 완전한 검정 구석을 없앤다(형태는 살리되 밝히지 않는다)
area("fill",     (0.30,0.36,0.46), 60,  (0, 4, 4.2), (0,0,0), 8.0)
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = hexlin(0x05070c)
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.15

# ── 카메라 — 매크로, 얕은 심도. 앞 툴의 적색 표시등에 초점, 뒤는 녹는다 ──────────
cam_data = bpy.data.cameras.new("cam"); cam = bpy.data.objects.new("cam", cam_data)
bpy.context.collection.objects.link(cam)
cam.location = Vector((0.18, -0.30, 1.36))
# 통로 안쪽·약간 위를 겨눈다(앞 오른쪽 툴의 표시등 언저리)
target = Vector((AISLE_X-0.55, Y0+0.2, 1.9))
d = target - cam.location
cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
cam_data.lens = 50
cam_data.dof.use_dof = True
cam_data.dof.focus_distance = (target - cam.location).length
cam_data.dof.aperture_fstop = 1.8     # 얕게 — 앞만 또렷하고 통로 안쪽은 보케
scene.camera = cam

# ── 사이클즈 GPU 자동 감지 ────────────────────────────────────────────────────
scene.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
picked = 'CPU'
for backend in ('OPTIX','CUDA','HIP','METAL','ONEAPI'):
    try:
        prefs.compute_device_type = backend
        prefs.get_devices()
        gpus = [d for d in prefs.devices if d.type == backend]
        if gpus:
            for d in prefs.devices: d.use = (d.type == backend)
            scene.cycles.device = 'GPU'; picked = backend
            break
    except Exception:
        continue
if picked == 'CPU':
    scene.cycles.device = 'CPU'
print(f"[CUT02] 렌더 장치: {picked}")

scene.cycles.samples = 256
scene.cycles.use_denoising = True
scene.view_settings.view_transform = 'AgX'   # 4.x 기본 필름 — 하이라이트가 곱게 굴러간다
scene.view_settings.look = 'AgX - Medium High Contrast'

# ── 출력 ─────────────────────────────────────────────────────────────────────
scene.render.resolution_x = 1920
scene.render.resolution_y = 1080
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
out = os.path.abspath("result.png")
scene.render.filepath = out
print(f"[CUT02] 렌더 시작 → {out}")
bpy.ops.render.render(write_still=True)
print(f"[CUT02] 완료: {out}")
