package client.zenthra.module.impl;

import client.zenthra.module.Category;
import client.zenthra.module.HudModule;
import client.zenthra.module.setting.BooleanSetting;
import client.zenthra.module.setting.ColorSetting;
import client.zenthra.util.Draw;
import client.zenthra.util.TextCache;

import client.zenthra.compat.Gfx;

public class DirectionHudModule extends HudModule {
	private static final String[] NAMES = {"S", "SO", "O", "NO", "N", "NE", "E", "SE"};

	private final ColorSetting color = add(new ColorSetting("color", "Couleur", 0xFFFFFFFF));
	private final BooleanSetting coords = add(new BooleanSetting("coords", "Coordonnées", true));
	private final BooleanSetting background = add(new BooleanSetting("background", "Fond", true));

	private final TextCache cache = new TextCache();

	public DirectionHudModule() {
		super("direction_hud", "Direction HUD", "Orientation cardinale et coordonnées.", Category.HUD, false, 0.45, 0.01);
	}

	@Override
	protected void renderElement(Gfx g, float partialTick, boolean editing) {
		String text;
		if (mc.player == null) {
			text = "N  0 64 0";
		} else {
			float yaw = ((mc.player.getYRot() % 360) + 360) % 360;
			int dirIndex = Math.round(yaw / 45f) % 8;
			String dir = NAMES[dirIndex];
			if (coords.get()) {
				int x = mc.player.getBlockX(), y = mc.player.getBlockY(), z = mc.player.getBlockZ();
				// Rebuilt only when the block position or the direction changes.
				if (cache.stale(TextCache.pack(x, z), TextCache.pack(y, dirIndex))) cache.set(String.format("%s  %d %d %d", dir, x, y, z));
			} else {
				int deg = Math.round(yaw);
				if (cache.stale(TextCache.pack(deg, dirIndex), -1L)) cache.set(dir + "  " + deg + "°");
			}
			text = cache.get();
		}
		int[] size = Draw.label(g, text, color.get(), background.get(), true);
		width = size[0];
		height = size[1];
	}
}
