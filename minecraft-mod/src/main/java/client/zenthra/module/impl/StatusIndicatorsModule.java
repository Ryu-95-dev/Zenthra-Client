package client.zenthra.module.impl;

import client.zenthra.ZenthraClient;
import client.zenthra.module.Category;
import client.zenthra.module.HudModule;
import client.zenthra.module.setting.BooleanSetting;
import client.zenthra.module.setting.ColorSetting;
import client.zenthra.util.Draw;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import client.zenthra.compat.Gfx;

/** Shows which Zenthra states are currently active (toggle sprint, free look, zoom). */
public class StatusIndicatorsModule extends HudModule {
	private final ColorSetting color = add(new ColorSetting("color", "Couleur", 0xFFC4B5FD));
	private final BooleanSetting background = add(new BooleanSetting("background", "Fond", true));

	public StatusIndicatorsModule() {
		super("status_indicators", "Indicateurs d'état", "Sprint maintenu, free look et zoom actifs.", Category.HUD, false, 0.005, 0.86);
	}

	@Override
	protected void renderElement(Gfx g, float partialTick, boolean editing) {
		var modules = ZenthraClient.modules();
		List<String> lines = new ArrayList<>();
		ToggleSprintModule sprint = modules.get(ToggleSprintModule.class);
		if (sprint.isEnabled() && sprint.isSprintHeld()) lines.add("Sprint maintenu");
		if (modules.get(FreeLookModule.class).isActive()) lines.add("Free Look");
		ZoomModule zoom = modules.get(ZoomModule.class);
		if (zoom.isZooming()) lines.add(String.format(Locale.ROOT, "Zoom ×%.1f", zoom.currentLevel()));
		if (lines.isEmpty() && editing) lines.add("Indicateurs d'état");

		int w = 0, y = 0;
		for (String line : lines) w = Math.max(w, Draw.font().width(line) + (background.get() ? 8 : 0));
		for (String line : lines) {
			if (background.get()) g.fill(0, y, w, y + 13, Draw.BG);
			g.text(line, background.get() ? 4 : 0, y + 3, color.get(), true);
			y += 14;
		}
		width = Math.max(w, 20);
		height = Math.max(y - 1, 10);
	}
}
