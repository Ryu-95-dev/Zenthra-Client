package client.zenthra.module.impl;

import client.zenthra.ZenthraClient;
import client.zenthra.gui.Ui;
import client.zenthra.gui.WaypointEditScreen;
import client.zenthra.gui.ZIcon;
import client.zenthra.module.Category;
import client.zenthra.module.Module;
import client.zenthra.module.setting.BooleanSetting;
import client.zenthra.module.setting.ChoiceSetting;
import client.zenthra.module.setting.NumberSetting;
import client.zenthra.util.Draw;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import java.util.ArrayList;
import java.util.List;
import client.zenthra.compat.Gfx;
import client.zenthra.compat.Platform;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4f;
import org.joml.Vector4f;

public class WaypointsModule extends Module {
	public static final class Waypoint {
		public String name;
		public int x, y, z;
		public String dimension;
		public int color;
		public boolean visible = true;
		/** World or server it belongs to ("server:<ip>" / "local:<world>"); null = every world. */
		public String world;
		/** Marker icon (one of {@link #ICONS}); null = first letter of the name. */
		public String icon;

		public Waypoint(String name, int x, int y, int z, String dimension, int color) {
			this.name = name;
			this.x = x;
			this.y = y;
			this.z = z;
			this.dimension = dimension;
			this.color = color;
		}
	}

	/** Icons a waypoint marker can use instead of its first letter. */
	public static final List<String> ICONS = List.of("house", "swords", "chest", "star", "skull", "flag", "mountain", "gem",
		"pickaxe", "tree", "portal", "heart", "bed", "castle", "anchor", "tent");

	private final List<Waypoint> waypoints = new ArrayList<>();
	private final BooleanSetting showDistance = add(new BooleanSetting("show_distance", "Afficher la distance", true));
	private final NumberSetting markerScale = add(new NumberSetting("marker_scale", "Taille des repères", 0.8, 0.5, 1.5, 0.05, "x"));
	private final NumberSetting maxDistance = add(new NumberSetting("max_distance", "Distance maximale d'affichage", 2000, 50, 10000, 50, " blocs"));
	private final ChoiceSetting scope = add(new ChoiceSetting("scope", "Repères affichés",
		List.of("world", "all"), List.of("Monde ou serveur actuel", "Tous les mondes"), "world"));

	// Matrices captured during world rendering, used to project waypoints on the HUD.
	private final Matrix4f view = new Matrix4f();
	private final Matrix4f projection = new Matrix4f();
	private Vec3 cameraPos = Vec3.ZERO;
	private boolean haveMatrices;

	public WaypointsModule() {
		super("waypoints", "Waypoints", "Repères personnalisés avec nom, couleur et distance.", Category.WORLD, true);
	}

	@Override
	public String hint() {
		return "Touche B : ajouter un repère à ta position. Gestion complète dans Modules Zenthra → Waypoints.";
	}

	public List<Waypoint> list() {
		return waypoints;
	}

	public String currentDimension() {
		return mc.level != null ? Platform.dimensionId(mc.level) : "minecraft:overworld";
	}

	/** Identifies the current server or singleplayer world, or null when unknown. */
	public String currentWorld() {
		String local = Platform.singleplayerWorldName();
		if (local != null) return "local:" + local;
		if (mc.getCurrentServer() != null) return "server:" + mc.getCurrentServer().ip.toLowerCase(java.util.Locale.ROOT);
		return null;
	}

	/** Same dimension, and same world/server unless the player chose to see every world's waypoints. */
	public boolean belongsHere(Waypoint wp) {
		if (!wp.dimension.equals(currentDimension())) return false;
		return scope.is("all") || wp.world == null || wp.world.equals(currentWorld());
	}

	/** New waypoint at the player's position, tied to the current world. */
	public Waypoint createHere(String name) {
		Waypoint wp = new Waypoint(name, mc.player.getBlockX(), mc.player.getBlockY(), mc.player.getBlockZ(), currentDimension(), 0xFFA855F7);
		wp.world = currentWorld();
		return wp;
	}

	@Override
	public void tick() {
		while (ZenthraClient.keys().addWaypoint.consumeClick()) {
			if (mc.player != null && Platform.screen() == null) {
				Platform.setScreen(new WaypointEditScreen(null, createHere("Repère " + (waypoints.size() + 1)), true));
			}
		}
	}

	public void add(Waypoint wp) {
		waypoints.add(wp);
		ZenthraClient.config().markDirty();
	}

	public void remove(Waypoint wp) {
		waypoints.remove(wp);
		ZenthraClient.config().markDirty();
	}

	public void captureMatrices(Matrix4f viewMatrix, Matrix4f projectionMatrix, Vec3 camera) {
		view.set(viewMatrix);
		projection.set(projectionMatrix);
		cameraPos = camera;
		haveMatrices = true;
	}

	public void renderHud(Gfx g) {
		if (!isEnabled() || !haveMatrices || mc.player == null || Platform.hudHidden()) return;
		int sw = mc.getWindow().getGuiScaledWidth();
		int sh = mc.getWindow().getGuiScaledHeight();
		for (Waypoint wp : waypoints) {
			if (!wp.visible || !belongsHere(wp)) continue;
			Vec3 target = new Vec3(wp.x + 0.5, wp.y + 1.0, wp.z + 0.5);
			double dist = mc.player.position().distanceTo(target);
			if (dist > maxDistance.get()) continue;
			Vector4f p = new Vector4f((float) (target.x - cameraPos.x), (float) (target.y - cameraPos.y), (float) (target.z - cameraPos.z), 1f);
			view.transform(p);
			projection.transform(p);
			if (p.w <= 0.05f) continue; // behind the camera
			float sx = (p.x / p.w * 0.5f + 0.5f) * sw;
			float sy = (1f - (p.y / p.w * 0.5f + 0.5f)) * sh;
			if (sx < -50 || sx > sw + 50 || sy < -20 || sy > sh + 20) continue;

			drawMarker(g, wp, sx, sy, markerScale.getFloat(), showDistance.get() ? Math.round(dist) + " m" : null);
		}
	}

	/**
	 * Small marker: a coloured square with the waypoint's icon or first letter, the
	 * name underneath (and the distance below it), centred on (cx, cy).
	 */
	public static void drawMarker(Gfx g, Waypoint wp, float cx, float cy, float scale, String distance) {
		g.push();
		g.translate(cx, cy);
		g.scale(scale);
		int s = 12;
		Ui.round(g, -s / 2 - 1, -s - 1, s + 2, s + 2, 0x60000000);
		Ui.round(g, -s / 2, -s, s, s, wp.color | 0xFF000000);
		g.fill(-s / 2 + 1, -s, s / 2 - 1, -s + 1, 0x40FFFFFF);
		ZIcon icon = iconOf(wp);
		if (icon != null) {
			Ui.icon(g, icon, -s / 2 + 2, -s + 2, s - 4, true);
		} else {
			String letter = wp.name.isEmpty() ? "?" : wp.name.substring(0, 1).toUpperCase(java.util.Locale.ROOT);
			g.text(letter, -Draw.font().width(letter) / 2 + 1, -s + 2, 0xFFFFFFFF, true);
		}
		g.text(wp.name, -Draw.font().width(wp.name) / 2, 3, 0xFFFFFFFF, true);
		if (distance != null) g.text(distance, -Draw.font().width(distance) / 2, 13, 0xFFD0C8DC, true);
		g.pop();
	}

	public static ZIcon iconOf(Waypoint wp) {
		if (wp.icon == null || !ICONS.contains(wp.icon)) return null;
		return ZIcon.valueOf("WP_" + wp.icon.toUpperCase(java.util.Locale.ROOT));
	}

	public void loadWaypoints(JsonArray arr) {
		waypoints.clear();
		for (JsonElement el : arr) {
			if (!el.isJsonObject()) continue;
			JsonObject o = el.getAsJsonObject();
			try {
				Waypoint wp = new Waypoint(
					o.get("name").getAsString(),
					o.get("x").getAsInt(),
					o.get("y").getAsInt(),
					o.get("z").getAsInt(),
					o.has("dimension") ? o.get("dimension").getAsString() : "minecraft:overworld",
					parseColor(o.has("color") ? o.get("color").getAsString() : "#A855F7"));
				wp.visible = !o.has("visible") || o.get("visible").getAsBoolean();
				if (o.has("world") && o.get("world").isJsonPrimitive()) wp.world = o.get("world").getAsString();
				if (o.has("icon") && o.get("icon").isJsonPrimitive()) wp.icon = o.get("icon").getAsString();
				waypoints.add(wp);
			} catch (RuntimeException ignored) {
				// Skip malformed entries rather than losing the whole list.
			}
		}
	}

	public JsonArray saveWaypoints() {
		JsonArray arr = new JsonArray();
		for (Waypoint wp : waypoints) {
			JsonObject o = new JsonObject();
			o.addProperty("name", wp.name);
			o.addProperty("x", wp.x);
			o.addProperty("y", wp.y);
			o.addProperty("z", wp.z);
			o.addProperty("dimension", wp.dimension);
			o.addProperty("color", String.format("#%06X", wp.color & 0xFFFFFF));
			o.addProperty("visible", wp.visible);
			if (wp.world != null) o.addProperty("world", wp.world);
			if (wp.icon != null) o.addProperty("icon", wp.icon);
			arr.add(o);
		}
		return arr;
	}

	private static int parseColor(String s) {
		if (s.matches("#[0-9a-fA-F]{6}")) return 0xFF000000 | Integer.parseInt(s.substring(1), 16);
		return 0xFFA855F7;
	}
}
