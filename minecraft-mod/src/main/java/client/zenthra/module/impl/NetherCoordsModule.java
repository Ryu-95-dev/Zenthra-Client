package client.zenthra.module.impl;

import client.zenthra.compat.Gfx;
import client.zenthra.module.Category;
import client.zenthra.module.HudModule;
import client.zenthra.module.setting.BooleanSetting;
import client.zenthra.module.setting.ColorSetting;
import client.zenthra.module.setting.NumberSetting;
import client.zenthra.util.Draw;
import client.zenthra.util.TextCache;
import client.zenthra.compat.Platform;

/** Matching coordinates in the other dimension (Overworld ÷ 8 = Nether). */
public class NetherCoordsModule extends HudModule {
	private final ColorSetting color = add(new ColorSetting("color", "Couleur", 0xFFFCA5A5));
	private final BooleanSetting background = add(new BooleanSetting("background", "Fond", true));

	private final TextCache cache = new TextCache();

	public NetherCoordsModule() {
		super("nether_coords", "Nether Coords", "Coordonnées correspondantes dans le Nether ou l'Overworld.", Category.WORLD, false, 0.45, 0.25);
	}

	@Override
	protected void renderElement(Gfx g, float partialTick, boolean editing) {
		String text;
		if (mc.player == null || mc.level == null) {
			text = "Nether : 0 0";
		} else {
			String dim = Platform.dimensionId(mc.level);
			int x = mc.player.getBlockX(), z = mc.player.getBlockZ();
			if (dim.endsWith("the_nether")) {
				if (cache.stale(TextCache.pack(x, z), 1)) cache.set("Overworld : " + x * 8 + " " + z * 8);
				text = cache.get();
			} else if (dim.endsWith("overworld")) {
				if (cache.stale(TextCache.pack(x, z), 2)) cache.set("Nether : " + Math.floorDiv(x, 8) + " " + Math.floorDiv(z, 8));
				text = cache.get();
			} else text = "Pas de correspondance ici";
		}
		int[] size = Draw.label(g, text, color.get(), background.get(), true);
		width = size[0];
		height = size[1];
	}
}