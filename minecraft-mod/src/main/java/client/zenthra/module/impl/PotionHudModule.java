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

	// Reused every frame instead of allocating new lists.
	private final List<MobEffectInstance> list = new ArrayList<>();
	private final List<String> names = new ArrayList<>();
	private final List<String> times = new ArrayList<>();
	/** "m:ss" texts already built, indexed by remaining seconds (durations up to one hour). */
	private static final String[] DURATIONS = new String[3600];

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
		list.clear();
		names.clear();
		times.clear();
		list.addAll(effects);
		for (MobEffectInstance e : list) {
			String name = Platform.effectName(e);
			if (e.getAmplifier() > 0) name += " " + roman(e.getAmplifier() + 1);
			names.add(name);
			times.add(duration(e));
		}
		if (names.isEmpty() && editing) {
			names.add("Vitesse II");
			times.add("1:30");
		}
		int rows = names.size();

		int lineH = 20;
		int maxW = 60;
		for (int i = 0; i < rows; i++) maxW = Math.max(maxW, (icons.get() ? 22 : 0) + Math.max(Draw.font().width(names.get(i)), Draw.font().width(times.get(i))) + 4);
		if (background.get() && rows > 0) g.fill(-2, -2, maxW + 2, rows * lineH, Draw.BG);
		for (int i = 0; i < rows; i++) {
			int y = i * lineH;
			int x = 0;
			if (icons.get() && i < list.size()) {
				g.effectIcon(list.get(i), 0, y);
				x = 22;
			} else if (icons.get()) {
				x = 22;
			}
			g.text(names.get(i), x, y, nameColor.get(), true);
			g.text(times.get(i), x, y + 9, timeColor.get(), true);
		}
		width = maxW;
		height = Math.max(18, rows * lineH - 2);
	}

	private static String duration(MobEffectInstance e) {
		if (e.isInfiniteDuration()) return "∞";
		int seconds = e.getDuration() / 20;
		if (seconds < 0 || seconds >= DURATIONS.length) return String.format("%d:%02d", seconds / 60, seconds % 60);
		String s = DURATIONS[seconds];
		if (s == null) DURATIONS[seconds] = s = String.format("%d:%02d", seconds / 60, seconds % 60);
		return s;
	}

	private static final String[] ROMAN = {"I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"};

	private static String roman(int n) {
		return n >= 1 && n <= 10 ? ROMAN[n - 1] : String.valueOf(n);
	}
}
