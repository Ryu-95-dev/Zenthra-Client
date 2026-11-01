package client.zenthra.module.impl;

import client.zenthra.compat.Gfx;
import client.zenthra.module.Category;
import client.zenthra.module.HudModule;
import client.zenthra.module.setting.BooleanSetting;
import client.zenthra.module.setting.ColorSetting;
import client.zenthra.module.setting.NumberSetting;
import client.zenthra.util.Draw;
/** Java memory used by the game. */
public class MemoryModule extends HudModule {
	private final BooleanSetting background = add(new BooleanSetting("background", "Fond", true));

	public MemoryModule() {
		super("memory_display", "Mémoire", "Mémoire utilisée par le jeu (RAM Java).", Category.UTILITY, false, 0.25, 0.07);
	}

	@Override
	protected void renderElement(Gfx g, float partialTick, boolean editing) {
		Runtime rt = Runtime.getRuntime();
		long used = (rt.totalMemory() - rt.freeMemory()) / 1048576, max = rt.maxMemory() / 1048576;
		int pct = (int) (100 * used / Math.max(1, max));
		int color = pct < 70 ? 0xFFFFFFFF : pct < 90 ? 0xFFFACC15 : 0xFFF87171;
		int[] size = Draw.label(g, "RAM " + pct + "% · " + used + "/" + max + " Mo", color, background.get(), true);
		width = size[0];
		height = size[1];
	}
}