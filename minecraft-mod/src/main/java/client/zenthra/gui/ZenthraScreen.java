package client.zenthra.gui;

import client.zenthra.ZenthraClient;
import client.zenthra.compat.Gfx;
import client.zenthra.compat.PerfOption;
import client.zenthra.compat.Platform;
import client.zenthra.diag.Telemetry;
import net.minecraft.client.gui.screens.ConfirmScreen;
import client.zenthra.module.Category;
import client.zenthra.module.Module;
import client.zenthra.module.impl.ArmorHudModule;
import client.zenthra.module.impl.CpsCounterModule;
import client.zenthra.module.impl.CrosshairModule;
import client.zenthra.module.impl.FpsCounterModule;
import client.zenthra.module.impl.KeystrokesModule;
import client.zenthra.module.impl.PotionHudModule;
import client.zenthra.module.impl.ToggleSprintModule;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;

/** In-game modules menu ("Modules Zenthra" / "Zenthra Skills"), opened from the pause menu or Right Shift. */
public class ZenthraScreen extends BaseScreen {
	private enum View { MODULES, PROFILES, PERFORMANCE, DIAGNOSTIC }

	/** Translation key of the menu name, also used for the pause-menu button. */
	public static final String TITLE_KEY = "zenthra.menu.title";
	private static final int SIDEBAR_W = 104;
	private static View view = View.MODULES;
	private static Category category = null; // null = all

	private EditBox search;
	private double scroll;

	public ZenthraScreen(Screen parent) {
		super(Component.translatable(TITLE_KEY), parent);
	}

	@Override
	protected void init() {
		layoutPanel(500, 310);
		int contentX = px + SIDEBAR_W + 10;
		int contentW = pw - SIDEBAR_W - 20;
		search = editBox(contentX + contentW - 140, py + 9, 140, 16, "Rechercher…");
		search.setResponder(s -> scroll = 0);
		search.visible = view == View.MODULES;

		// Bottom action bar.
		String[] labels = {"Éditer HUD", "Touches", "Graphismes", "Packs", "Retour"};
		int bw = (pw - 20 - 4 * 4) / 5;
		int by = py + ph - 26;
		Runnable[] actions = {
			() -> Platform.setScreen(new HudEditorScreen(this)),
			() -> Platform.setScreen(Platform.keyBindsScreen(this)),
			() -> Platform.setScreen(Platform.videoSettingsScreen(this)),
			() -> Platform.setScreen(Platform.resourcePackScreen(this)),
			this::onClose,
		};
		for (int i = 0; i < 5; i++) {
			Runnable action = actions[i];
			button(labels[i], px + 10 + i * (bw + 4), by, bw, 20, b -> action.run());
		}
	}

	@Override
	protected void renderContent(Gfx g, int mx, int my, float pt) {
		// Sidebar.
		g.fill(px + 1, py + 1, px + SIDEBAR_W, py + ph - 32, SIDEBAR);
		// Title in the game language, with the brand name highlighted ("Modules Zenthra" / "Zenthra Skills").
		String title = font.plainSubstrByWidth(getTitle().getString(), SIDEBAR_W - 14);
		int brand = title.indexOf("Zenthra");
		int tx = px + 10;
		if (brand < 0) {
			g.text(title, tx, py + 11, TEXT, false);
		} else {
			String before = title.substring(0, brand), after = title.substring(brand + "Zenthra".length());
			tx = g.text(before, tx, py + 11, TEXT, false);
			tx = g.text("Zenthra", tx, py + 11, ACCENT, false);
			g.text(after, tx, py + 11, TEXT, false);
		}

		int y = py + 28;
		y = sideItem(g, mx, my, y, "Tous les modules", view == View.MODULES && category == null, () -> select(View.MODULES, null));
		for (Category c : Category.values()) {
			y = sideItem(g, mx, my, y, c.label, view == View.MODULES && category == c, () -> select(View.MODULES, c));
		}
		y += 4;
		y = sideItem(g, mx, my, y, "Profils rapides", view == View.PROFILES, () -> select(View.PROFILES, null));
		y = sideItem(g, mx, my, y, "Performance", view == View.PERFORMANCE, () -> select(View.PERFORMANCE, null));
		y = sideItem(g, mx, my, y, "Diagnostic", view == View.DIAGNOSTIC, () -> select(View.DIAGNOSTIC, null));
		sideItem(g, mx, my, y, "Waypoints", false, () -> Platform.setScreen(new WaypointsScreen(this)));

		int cx = px + SIDEBAR_W + 10;
		int cw = pw - SIDEBAR_W - 20;
		String heading = switch (view) {
			case MODULES -> category == null ? "Tous les modules" : category.label;
			case PROFILES -> "Profils rapides";
			case PERFORMANCE -> "Performance";
			case DIAGNOSTIC -> "Diagnostic";
		};
		g.text(heading, cx, py + 13, TEXT, false);

		int top = py + 32;
		int bottom = py + ph - 34;
		switch (view) {
			case MODULES -> renderModules(g, mx, my, cx, top, cw, bottom);
			case PROFILES -> renderProfiles(g, mx, my, cx, top, cw);
			case PERFORMANCE -> renderPerformance(g, mx, my, cx, top, cw);
			case DIAGNOSTIC -> renderDiagnostic(g, cx, top, cw);
		}
	}

	/** Real measurements from the running game (see Telemetry). */
	private void renderDiagnostic(Gfx g, int x, int top, int w) {
		Telemetry t = ZenthraClient.telemetry();
		Runtime rt = Runtime.getRuntime();
		double[] ft = minecraft.level != null ? t.frameTimes() : null;
		long used = (rt.totalMemory() - rt.freeMemory()) / 1048576, max = rt.maxMemory() / 1048576;
		String[][] rows = {
			{"FPS", t.fps() + "  (moyenne 30 s : " + Math.round(t.averageFps()) + ")"},
			{"Temps de frame", ft == null ? "indisponible hors d'un monde" : String.format(Locale.ROOT, "%.1f ms (pire : %.1f ms)", ft[0], ft[1])},
			{"Mémoire Java", used + " / " + max + " Mo"},
			{"Démarrage du jeu", t.startupMs() < 0 ? "indisponible" : String.format(Locale.ROOT, "%.1f s", t.startupMs() / 1000.0)},
			{"Java", System.getProperty("java.version")},
			{"Carte graphique", Platform.gpu()},
			{"Mods chargés", String.valueOf(t.userModCount())},
		};
		int labelW = 0;
		for (String[] r : rows) labelW = Math.max(labelW, font.width(r[0]));
		int valueX = x + 8 + labelW + 12;
		int y = top;
		for (String[] r : rows) {
			g.fill(x, y, x + w, y + 18, CARD);
			g.text(r[0], x + 8, y + 5, MUTED, false);
			g.text(font.plainSubstrByWidth(r[1], x + w - valueX - 6), valueX, y + 5, TEXT, false);
			y += 20;
		}
		// Java memory bar (used / maximum).
		g.fill(x, y + 2, x + w, y + 6, 0xFF3A3A44);
		g.fill(x, y + 2, x + (int) (w * Math.min(1.0, (double) used / max)), y + 6, ACCENT);
	}

	/** Opens the menu directly on the diagnostic view (used by the self-test). */
	public ZenthraScreen showDiagnostic() {
		view = View.DIAGNOSTIC;
		category = null;
		return this;
	}

	private void select(View v, Category c) {
		view = v;
		category = c;
		scroll = 0;
		search.visible = v == View.MODULES;
	}

	private int sideItem(Gfx g, int mx, int my, int y, String label, boolean active, Runnable action) {
		int x = px + 4, w = SIDEBAR_W - 8, h = 13;
		if (active) g.fill(x, y, x + w, y + h, ACCENT_SOFT);
		else if (hovered(mx, my, x, y, w, h)) g.fill(x, y, x + w, y + h, 0x14FFFFFF);
		if (active) g.fill(x, y, x + 2, y + h, ACCENT);
		g.text(label, x + 7, y + 3, active ? TEXT : MUTED, false);
		region(x, y, w, h, action);
		return y + h + 1;
	}

	private void renderModules(Gfx g, int mx, int my, int x, int top, int w, int bottom) {
		String q = search.getValue().toLowerCase(Locale.ROOT);
		List<Module> list = ZenthraClient.modules().all().stream()
			.filter(m -> category == null || m.category() == category)
			.filter(m -> q.isEmpty() || m.name().toLowerCase(Locale.ROOT).contains(q) || m.description().toLowerCase(Locale.ROOT).contains(q))
			.toList();

		// Two columns only when they leave room for the descriptions.
		int cols = w >= 320 ? 2 : 1;
		int colW = cols == 2 ? (w - 6) / 2 : w;
		int cardH = cols == 2 ? 34 : 28;
		int rows = (list.size() + cols - 1) / cols;
		int contentH = rows * (cardH + 6);
		double maxScroll = Math.max(0, contentH - (bottom - top));
		scroll = Mth.clamp(scroll, 0, maxScroll);

		g.scissor(x, top, x + w, bottom);
		for (int i = 0; i < list.size(); i++) {
			Module m = list.get(i);
			int cx = x + (i % cols) * (colW + 6);
			int cy = top + (i / cols) * (cardH + 6) - (int) scroll;
			if (cy + cardH < top || cy > bottom) continue;
			boolean hover = hovered(mx, my, cx, cy, colW, cardH) && my >= top && my < bottom;
			g.fill(cx, cy, cx + colW, cy + cardH, hover ? CARD_HOVER : CARD);
			if (m.isEnabled()) g.fill(cx, cy, cx + 2, cy + cardH, ACCENT);
			g.text(m.name(), cx + 8, cy + 5, TEXT, false);
			String desc = font.plainSubstrByWidth(m.description(), colW - 44);
			if (!desc.equals(m.description())) desc = font.plainSubstrByWidth(desc, colW - 44 - font.width("…")) + "…";
			g.text(desc, cx + 8, cy + cardH - 13, MUTED, false);
			drawToggle(g, cx + colW - 28, cy + (cardH - 10) / 2, m.isEnabled());
			if (my >= top && my < bottom) {
				region(cx, cy, colW - 34, cardH, () -> Platform.setScreen(new ModuleSettingsScreen(this, m)));
				region(cx + colW - 34, cy, 34, cardH, () -> {
					m.toggle();
					ZenthraClient.config().markDirty();
				});
			}
		}
		g.endScissor();
		if (list.isEmpty()) g.text("Aucun module ne correspond.", x, top + 4, MUTED, false);
	}

	private void renderProfiles(Gfx g, int mx, int my, int x, int top, int w) {
		record Preset(String name, String desc, Set<Class<? extends Module>> enabled) {}
		List<Preset> presets = List.of(
			new Preset("PvP", "Keystrokes, CPS, FPS, armure, potions, viseur, sprint.",
				Set.of(KeystrokesModule.class, CpsCounterModule.class, FpsCounterModule.class, ArmorHudModule.class, PotionHudModule.class, CrosshairModule.class, ToggleSprintModule.class)),
			new Preset("Minimal", "Uniquement le compteur de FPS.", Set.of(FpsCounterModule.class)),
			new Preset("Aucun HUD", "Désactive tous les éléments affichés à l'écran.", Set.of()));
		int y = top;
		for (Preset p : presets) {
			boolean hover = hovered(mx, my, x, y, w, 34);
			g.fill(x, y, x + w, y + 34, hover ? CARD_HOVER : CARD);
			g.text(p.name(), x + 8, y + 6, TEXT, false);
			g.text(p.desc(), x + 8, y + 19, MUTED, false);
			g.text("Appliquer", x + w - 8 - font.width("Appliquer"), y + 13, ACCENT, false);
			region(x, y, w, 34, () -> {
				for (Module m : ZenthraClient.modules().all()) {
					if (m.category() == Category.HUD || p.enabled().contains(m.getClass()) || m instanceof CrosshairModule || m instanceof ToggleSprintModule) {
						m.setEnabled(p.enabled().contains(m.getClass()));
					}
				}
				ZenthraClient.config().markDirty();
			});
			y += 40;
		}
		g.text("Les autres modules (zoom, free look, waypoints…) ne sont pas modifiés.", x, y + 2, MUTED, false);

		// Full reset, behind a confirmation. Waypoints are personal data and are kept.
		int ry = y + 16;
		boolean hover = hovered(mx, my, x, ry, w, 22);
		g.fill(x, ry, x + w, ry + 22, hover ? 0x40EF4444 : 0x22EF4444);
		g.text("Réinitialiser tous les modules", x + 8, ry + 7, 0xFFFCA5A5, false);
		region(x, ry, w, 22, () -> Platform.setScreen(new ConfirmScreen(
			confirmed -> {
				if (confirmed) {
					for (Module m : ZenthraClient.modules().all()) m.resetToDefaults();
					ZenthraClient.config().markDirty();
				}
				Platform.setScreen(this);
			},
			Component.literal("Réinitialiser tous les modules ?"),
			Component.literal("Réglages, positions du HUD et activation reviennent aux valeurs d'origine. Tes waypoints sont conservés."))));
	}

	private void renderPerformance(Gfx g, int mx, int my, int x, int top, int w) {
		g.text("FPS actuels : " + minecraft.getFps(), x, top, ACCENT, false);
		int y = top + 16;
		for (PerfOption option : Platform.perfOptions()) y = optionRow(g, mx, my, x, y, w, option.label(), option.value().get(), option.next());
		g.text("Clique pour changer. Les gains dépendent de ton matériel.", x, y + 4, MUTED, false);
	}

	private int optionRow(Gfx g, int mx, int my, int x, int y, int w, String label, String value, Runnable action) {
		boolean hover = hovered(mx, my, x, y, w, 20);
		g.fill(x, y, x + w, y + 20, hover ? CARD_HOVER : CARD);
		g.text(label, x + 8, y + 6, TEXT, false);
		g.text(value, x + w - 8 - font.width(value), y + 6, ACCENT, false);
		region(x, y, w, 20, () -> {
			action.run();
			minecraft.options.save();
		});
		return y + 24;
	}

	@Override
	protected boolean zScroll(double mx, double my, double amount) {
		if (view != View.MODULES) return false;
		scroll -= amount * 20;
		return true;
	}

	@Override
	protected boolean zKey(int key, int scan, int mods) {
		if (Platform.keyMatches(ZenthraClient.keys().openMenu, key, scan) && !search.isFocused()) {
			onClose();
			return true;
		}
		return false;
	}
}
