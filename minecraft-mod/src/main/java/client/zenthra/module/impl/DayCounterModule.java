package client.zenthra.module.impl;

import client.zenthra.compat.Gfx;
import client.zenthra.module.Category;
import client.zenthra.module.HudModule;
import client.zenthra.module.setting.BooleanSetting;
import client.zenthra.module.setting.ColorSetting;
import client.zenthra.module.setting.NumberSetting;
import client.zenthra.util.Draw;import client.zenthra.compat.Platform;

/** Number of the current in-game day. */
public class DayCounterModule extends HudModule {
	private final ColorSetting color = add(new ColorSetting("color", "Couleur", 0xFFFFFFFF));
	private final BooleanSetting background = add(new BooleanSetting("background", "Fond", true));

	public DayCounterModule() {
		super("day_counter", "Day Counter", "Numéro du jour en cours dans le monde.", Category.WORLD, false, 0.45, 0.13);
	}

	@Override
	protected void renderElement(Gfx g, float partialTick, boolean editing) {
		long day = mc.level == null ? 1 : Platform.dayTime(mc.level) / 24000L + 1;
		int[] size = Draw.label(g, "Jour " + day, color.get(), background.get(), true);
		width = size[0];
		height = size[1];
	}
}