package client.zenthra.module.impl;

import client.zenthra.module.Category;
import client.zenthra.module.HudModule;
import client.zenthra.module.setting.BooleanSetting;
import client.zenthra.module.setting.ColorSetting;
import client.zenthra.util.Draw;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import client.zenthra.compat.Gfx;
import client.zenthra.compat.Platform;
import net.minecraft.world.effect.MobEffectInstance;

public class PotionHudModule extends HudModule {
	private final ColorSetting nameColor = add(new ColorSetting("name_color", "Couleur du nom", 0xFFFFFFFF));
	private final ColorSetting timeColor = add(new ColorSetting("time_color", "Couleur de la durée", 0xFFB9B5C9));
	private final BooleanSetting icons = add(new BooleanSetting("icons", "Icônes", true));
	private final BooleanSetting background = add(new BooleanSetting("background", "Fond", false));
	private final BooleanSetting hideVanilla = add(new BooleanSetting("hide_vanilla", "Masquer les icônes d'effets vanilla", true));

	public PotionHudModule() {
		super("potion_hud", "Potion HUD", "Effets actifs et durée restante.", Category.HUD, true, 0.005, 0.54);
	}

	/** Whether the vanilla top-right effect icons should be hidden (see GuiMixin). */
	public boolean hidesVanillaEffects() {
		return isEnabled() && hideVanilla.get();
	}

	@Override
	protected void renderElement(Gfx g, float partialTick, boolean editing) {
		Collection<MobEffectInstance> effects = mc.player != null ? mc.player.getActiveEffects() : List.of();
		List<String[]> rows = new ArrayList<>();
		List<MobEffectInstance> list = new ArrayList<>(effects);
		for (MobEffectInstance e : list) {
			String name = Platform.effectName(e);
			if (e.getAmplifier() > 0) name += " " + roman(e.getAmplifier() + 1);
			rows.add(new String[] {name, duration(e)});
		}
		if (rows.isEmpty() && editing) rows.add(new String[] {"Vitesse II", "1:30"});

		int lineH = 20;
		int maxW = 60;
		for (String[] r : rows) maxW = Math.max(maxW, (icons.get() ? 22 : 0) + Math.max(Draw.font().width(r[0]), Draw.font().width(r[1])) + 4);
		if (background.get() && !rows.isEmpty()) g.fill(-2, -2, maxW + 2, rows.size() * lineH, Draw.BG);
		for (int i = 0; i < rows.size(); i++) {
			int y = i * lineH;
			int x = 0;
			if (icons.get() && i < list.size()) {
				g.effectIcon(list.get(i), 0, y);
				x = 22;
			} else if (icons.get()) {
				x = 22;
			}
			g.text(rows.get(i)[0], x, y, nameColor.get(), true);
			g.text(rows.get(i)[1], x, y + 9, timeColor.get(), true);
		}
		width = maxW;
		height = Math.max(18, rows.size() * lineH - 2);
	}

	private static String duration(MobEffectInstance e) {
		if (e.isInfiniteDuration()) return "∞";
		int seconds = e.getDuration() / 20;
		return String.format("%d:%02d", seconds / 60, seconds % 60);
	}

	private static String roman(int n) {
		String[] r = {"I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"};
		return n >= 1 && n <= 10 ? r[n - 1] : String.valueOf(n);
	}
}
