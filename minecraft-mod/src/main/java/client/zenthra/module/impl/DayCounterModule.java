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

/** Number of the current in-game day. */
public class DayCounterModule extends HudModule {
	private final ColorSetting color = add(new ColorSetting("color", "Couleur", 0xFFFFFFFF));
	private final BooleanSetting background = add(new BooleanSetting("background", "Fond", true));

	private final TextCache text = new TextCache();

	public DayCounterModule() {
		super("day_counter", "Day Counter", "Numéro du jour en cours dans le monde.", Category.WORLD, false, 0.45, 0.13);
	}

	@Override
	protected void renderElement(Gfx g, float partialTick, boolean editing) {
		long day = mc.level == null ? 1 : Platform.dayTime(mc.level) / 24000L + 1;
		if (text.stale(day, 0)) text.set("Jour " + day);
		int[] size = Draw.label(g, text.get(), color.get(), background.get(), true);
		width = size[0];
		height = size[1];
	}
}