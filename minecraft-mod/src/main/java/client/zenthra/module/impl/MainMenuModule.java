package client.zenthra.module.impl;

import client.zenthra.module.Category;
import client.zenthra.module.Module;
import client.zenthra.module.setting.BooleanSetting;

/** Replaces Minecraft's title screen with the Zenthra main menu (see gui/ZenthraTitleScreen). */
public class MainMenuModule extends Module {
	public final BooleanSetting animations = add(new BooleanSetting("animations", "Animations", true));
	public final BooleanSetting petals = add(new BooleanSetting("petals", "Pétales de sakura", true));

	public MainMenuModule() {
		super("main_menu", "Menu principal", "Menu d'accueil Zenthra à la place de l'écran titre de Minecraft.", Category.UTILITY, true);
	}

	@Override
	public String hint() {
		return "Désactive ce module pour retrouver l'écran titre de Minecraft. Les animations peuvent être coupées séparément.";
	}

	public boolean animated() {
		return animations.get();
	}
}