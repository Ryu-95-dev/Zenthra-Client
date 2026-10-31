package client.zenthra.module.impl;

import client.zenthra.module.Category;
import client.zenthra.module.Module;
import client.zenthra.module.setting.BooleanSetting;
import client.zenthra.module.setting.NumberSetting;

/** Adjusts the vanilla sidebar scoreboard (see GuiMixin). */
public class ScoreboardModule extends Module {
	public final NumberSetting scale = add(new NumberSetting("scale", "Échelle", 1.0, 0.5, 1.5, 0.05, "x"));
	public final NumberSetting offsetY = add(new NumberSetting("offset_y", "Décalage vertical", 0, -150, 150, 1, " px"));
	public final BooleanSetting hide = add(new BooleanSetting("hide", "Masquer le scoreboard", false));

	public ScoreboardModule() {
		super("scoreboard", "Scoreboard", "Position, échelle et affichage du scoreboard.", Category.HUD, false);
	}
}
