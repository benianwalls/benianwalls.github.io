"""Builds assets/models/rider.glb: the rider's body parts, sculpted in Blender.

Run headless:
    /Applications/Blender.app/Contents/MacOS/Blender -b --python tools/build_rider.py

Each part is modelled in a fixed frame so world.js can pose it with the same
IK it always used:
  * limbs run along Blender +Z from the origin (start joint) for `len` metres,
    with their front toward +X   (glTF/three.js: along +Y, front +X)
  * head / helmet / hand / shoe are centred on their joint, facing +X
"""
import bpy, bmesh, math, os

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "models", "rider.glb")

bpy.ops.wm.read_factory_settings(use_empty=True)

def lin(c):  # sRGB channel -> linear
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def material(name, hex_, rough=0.75, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    r, g, bl = ((hex_ >> 16) & 255) / 255, ((hex_ >> 8) & 255) / 255, (hex_ & 255) / 255
    b.inputs["Base Color"].default_value = (lin(r), lin(g), lin(bl), 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return m

SKIN = material("skin", 0x9C6644, 0.7)
JERSEY = material("jersey", 0x2563A8, 0.75)
JERSEY_TRIM = material("jersey_trim", 0xFF7A3D, 0.7)
SHORTS = material("shorts", 0x1F2A36, 0.8)
DARK = material("dark", 0x1C1F24, 0.6)
PACK = material("pack", 0x2D3436, 0.85)
HELMET = material("helmet", 0xFF7A3D, 0.4, 0.1)
WHITE = material("white", 0xF4F6F8, 0.6)
HAIR = material("hair", 0x1B1512, 0.9)
LIP = material("lip", 0x6E4029, 0.7)

def finish(obj, mats, subsurf=1, length=None):
    for m in mats:
        obj.data.materials.append(m)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    if subsurf:
        mod = obj.modifiers.new("sub", "SUBSURF")
        mod.levels = subsurf
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.shade_smooth()
    obj.select_set(False)
    if length is not None:
        obj["len"] = length
    return obj

def loft(name, rings, seg=14):
    """rings: [(z, rx, ry, cx)] bottom to top; closed with a pole at each end."""
    bm = bmesh.new()
    loops = []
    for z, rx, ry, cx in rings:
        loops.append([bm.verts.new((cx + rx * math.cos(2 * math.pi * i / seg), ry * math.sin(2 * math.pi * i / seg), z)) for i in range(seg)])
    for a, b in zip(loops, loops[1:]):
        for i in range(seg):
            bm.faces.new((a[i], a[(i + 1) % seg], b[(i + 1) % seg], b[i]))
    z0, _, _, c0 = rings[0]
    z1, _, _, c1 = rings[-1]
    p0 = bm.verts.new((c0, 0, z0 - rings[0][1] * 0.35))
    p1 = bm.verts.new((c1, 0, z1 + rings[-1][1] * 0.35))
    for i in range(seg):
        bm.faces.new((p0, loops[0][(i + 1) % seg], loops[0][i]))
        bm.faces.new((p1, loops[-1][i], loops[-1][(i + 1) % seg]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    return obj

def limb(name, length, stations, mat):
    """stations: [(t, depth_radius, width_radius, x_offset)], t from 0 to 1 along the limb.
    Rounded caps are added so joints overlap cleanly."""
    t0, rx0, ry0, c0 = stations[0]
    t1, rx1, ry1, c1 = stations[-1]
    rings = []
    for k in (0.45, 0.8):   # start cap
        rings.append((-rx0 * (1 - k) * 0.9, rx0 * math.sqrt(1 - (1 - k) ** 2), ry0 * math.sqrt(1 - (1 - k) ** 2), c0))
    rings += [(t * length, rx, ry, cx) for t, rx, ry, cx in stations]
    for k in (0.8, 0.45):   # end cap
        rings.append((length + rx1 * (1 - k) * 0.9, rx1 * math.sqrt(1 - (1 - k) ** 2), ry1 * math.sqrt(1 - (1 - k) ** 2), c1))
    return finish(loft(name, rings), [mat], subsurf=1, length=length)

def ball(name, r, loc, scale=(1, 1, 1), seg=16):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=seg, ring_count=seg // 2, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.select_set(False)
    return o

def block(name, size, loc, bevel=0.01, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = o.modifiers.new("bev", "BEVEL")
        mod.width = bevel
        mod.segments = 3
        bpy.ops.object.modifier_apply(modifier=mod.name)
    o.select_set(False)
    return o

def join(name, pieces):
    """pieces: [(object, material)] -> one object with a material slot per piece."""
    for o, m in pieces:
        o.data.materials.clear()
        o.data.materials.append(m)
    bpy.ops.object.select_all(action="DESELECT")
    for o, _ in pieces:
        o.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0][0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    bpy.ops.object.shade_smooth()
    o.select_set(False)
    return o

# ---------------- limbs ----------------
limb("thigh", 0.47, [(0, 0.085, 0.082, 0), (0.25, 0.09, 0.084, 0.006), (0.65, 0.074, 0.07, 0.004), (1, 0.06, 0.058, 0)], SHORTS)
limb("shin", 0.445, [(0, 0.055, 0.054, 0), (0.28, 0.062, 0.057, -0.013), (0.65, 0.047, 0.045, -0.005), (1, 0.037, 0.037, 0)], SKIN)
limb("upperarm", 0.27, [(0, 0.06, 0.06, 0), (0.5, 0.055, 0.053, 0), (1, 0.047, 0.047, 0)], JERSEY)
limb("forearm", 0.25, [(0, 0.045, 0.045, 0), (0.3, 0.048, 0.046, 0), (1, 0.033, 0.035, 0)], SKIN)
limb("neck", 0.12, [(0, 0.05, 0.05, 0), (1, 0.047, 0.047, 0)], SKIN)

# ---------------- torso + backpack ----------------
torso = loft("torso_body", [
    (-0.06, 0.07, 0.11, 0), (-0.02, 0.1, 0.145, 0),
    (0.0, 0.105, 0.15, 0), (0.2, 0.1, 0.138, 0.004), (0.42, 0.115, 0.165, 0.012), (0.59, 0.105, 0.185, 0.006),
    (0.63, 0.085, 0.165, 0.004), (0.66, 0.05, 0.1, 0.002),
], seg=18)
finish(torso, [JERSEY], subsurf=1)
band = loft("torso_band", [(0.3, 0.113, 0.158, 0.008), (0.345, 0.117, 0.164, 0.01)], seg=18)
finish(band, [JERSEY_TRIM], subsurf=0)
pack = block("torso_pack", (0.1, 0.24, 0.32), (-0.15, 0, 0.36), bevel=0.03)
strapL = block("strapL", (0.2, 0.03, 0.02), (-0.03, 0.1, 0.5), bevel=0.004)
strapR = block("strapR", (0.2, 0.03, 0.02), (-0.03, -0.1, 0.5), bevel=0.004)
t = join("torso", [(torso, JERSEY), (band, JERSEY_TRIM), (pack, PACK), (strapL, PACK), (strapR, PACK)])
t["len"] = 0.59

# ---------------- head ----------------
# one smooth sculpted shape (chin -> jaw -> cheek -> brow -> crown), with small,
# calm features: stylised characters read best when the face is understated
skull = loft("skull", [
    (-0.116, 0.032, 0.032, 0.026), (-0.098, 0.058, 0.05, 0.02), (-0.072, 0.076, 0.068, 0.013),
    (-0.042, 0.087, 0.078, 0.008), (-0.008, 0.095, 0.085, 0.004), (0.026, 0.099, 0.088, 0.001),
    (0.06, 0.098, 0.086, -0.003), (0.09, 0.086, 0.076, -0.009), (0.112, 0.058, 0.052, -0.013),
], seg=18)
finish(skull, [SKIN], subsurf=2)
nose = ball("nose", 0.013, (0.099, 0, -0.012), (0.85, 0.85, 1.2), seg=12)
earL = ball("earL", 0.02, (-0.004, 0.086, 0.002), (0.6, 0.35, 1.0), seg=10)
earR = ball("earR", 0.02, (-0.004, -0.086, 0.002), (0.6, 0.35, 1.0), seg=10)
eyeL = ball("eyeL", 0.0085, (0.094, 0.034, 0.02), (0.5, 1.0, 1.2), seg=12)
eyeR = ball("eyeR", 0.0085, (0.094, -0.034, 0.02), (0.5, 1.0, 1.2), seg=12)
browL = ball("browL", 0.012, (0.096, 0.035, 0.041), (0.35, 1.3, 0.2), seg=10)
browR = ball("browR", 0.012, (0.096, -0.035, 0.041), (0.35, 1.3, 0.2), seg=10)
mouth = ball("mouth", 0.014, (0.089, 0, -0.053), (0.3, 1.45, 0.16), seg=12)
hair = ball("hair", 0.1, (-0.02, 0, 0.036), (1.0, 0.93, 0.95))
curls = []
for i in range(12):  # short curls round the hairline and nape, so some shows under the helmet
    a = math.pi * (0.32 + 1.36 * i / 11)
    curls.append(ball(f"curl{i}", 0.02, (-0.02 + math.cos(a) * 0.088, math.sin(a) * 0.082, 0.02 + 0.012 * math.sin(i * 2.1)), seg=8))
join("head", [(skull, SKIN), (nose, SKIN), (earL, SKIN), (earR, SKIN),
              (eyeL, DARK), (eyeR, DARK), (browL, HAIR), (browR, HAIR), (mouth, LIP), (hair, HAIR)]
             + [(c, HAIR) for c in curls])

# ---------------- helmet ----------------
# sits above the brow, level, with the visor clear of the eyes
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.128, segments=24, ring_count=14, location=(0, 0, 0))
shell = bpy.context.active_object
shell.name = "shell"
shell.scale = (1.2, 1.0, 0.98)
bpy.ops.object.transform_apply(scale=True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.bisect(plane_co=(0, 0, 0.0), plane_no=(-0.1, 0, 1), clear_inner=True, use_fill=True)
bpy.ops.object.mode_set(mode="OBJECT")
shell.select_set(False)
vents = []
for i, y in enumerate((-0.062, -0.021, 0.021, 0.062)):
    v = ball(f"vent{i}", 0.02, (0.012, y, 0.118 - abs(y) * 0.42), (3.2, 0.45, 0.5), seg=10)
    v.rotation_euler = (math.copysign(0.5, y) * (abs(y) > 0.04) + math.copysign(0.18, y) * (abs(y) <= 0.04), 0, 0)
    vents.append(v)
rear = ball("rear", 0.02, (-0.125, 0, 0.045), (0.5, 2.2, 1.6), seg=10)
visor = block("visor", (0.075, 0.16, 0.01), (0.168, 0, 0.03), bevel=0.004, rot=(0, -0.12, 0))
rim = loft("rim", [(0.0, 0.152, 0.127, -0.004), (0.012, 0.154, 0.129, -0.002)], seg=24)
rim.rotation_euler = (0, 0.1, 0)
rim.location = (0, 0, 0.0)
helmet = join("helmet", [(shell, HELMET), (rim, DARK), (visor, DARK), (rear, DARK)] + [(v, DARK) for v in vents])
helmet.location = (-0.006, 0, 0.062)  # lifted so the brow and eyes stay visible

# ---------------- hands, shoes ----------------
palm = ball("palm", 0.045, (0, 0, 0), (1.15, 0.85, 0.8))
cuff = ball("cuff", 0.04, (-0.035, 0, 0.0), (0.7, 0.95, 0.95))
join("hand", [(palm, DARK), (cuff, HELMET)])

upper = block("upper", (0.23, 0.092, 0.07), (0.045, 0, 0.0), bevel=0.028)
toe = ball("toe", 0.046, (0.135, 0, -0.008), (1.2, 0.98, 0.72))
sole = block("sole", (0.25, 0.098, 0.02), (0.05, 0, -0.04), bevel=0.008)
tab = block("tab", (0.02, 0.094, 0.05), (-0.068, 0, 0.012), bevel=0.006)
laces = block("laces", (0.08, 0.05, 0.012), (0.07, 0, 0.034), bevel=0.004)
join("shoe", [(upper, DARK), (toe, DARK), (sole, WHITE), (tab, HELMET), (laces, WHITE)])

# ---------------- export ----------------
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_apply=True,
                          export_extras=True, export_yup=True, export_materials="EXPORT")
print("WROTE", OUT, [o.name for o in bpy.data.objects])
