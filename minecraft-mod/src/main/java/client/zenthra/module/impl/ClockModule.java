package client.zenthra.module.impl;

import client.zenthra.compat.Gfx;
import client.zenthra.module.Category;
import client.zenthra.module.HudModule;
import client.zenthra.module.setting.BooleanSetting;
import client.zenthra.module.setting.ColorSetting;
import client.zenthra.module.setting.NumberSetting;
import client.zenthra.util.Draw;import java.time.LocalTime;

/** Real-world time. */
public class ClockModule extends HudModule {
	private final ColorSetting color = add(new ColorSetting("color", "Couleur", 0xFFFFFFFF));
	private final BooleanSetting seconds = add(new BooleanSetting("seconds", "Secondes", false));
	private final BooleanSetting background = add(new BooleanSetting("background", "Fond", true));

	public ClockModule() {
		super("clock", "Horloge", "L'heure réelle, pour ne pas perdre la notion du temps.", Category.UTILITY, false, 0.33, 0.01);
	}

	@Override
	protected void renderElement(Gfx g, float partialTick, boolean editing) {
		LocalTime t = LocalTime.now();
		String text = seconds.get() ? String.format("%02d:%02d:%02d", t.getHour(), t.getMinute(), t.getSecond()) : String.format("%02d:%02d", t.getHour(), t.getMinute());
		int[] size = Draw.label(g, text, color.get(), background.get(), true);
		width = size[0];
		height = size[1];
	}
}