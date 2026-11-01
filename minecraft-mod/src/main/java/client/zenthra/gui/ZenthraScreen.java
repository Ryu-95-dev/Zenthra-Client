package client.zenthra.gui;

import client.zenthra.ZenthraClient;
import client.zenthra.compat.Gfx;
import client.zenthra.compat.PerfOption;
import client.zenthra.compat.Platform;
import client.zenthra.diag.Telemetry;
import client.zenthra.module.Category;
import client.zenthra.module.Module;
import client.zenthra.module.impl.ArmorHudModule;
import client.zenthra.module.impl.CpsCounterModule;
import client.zenthra.module.impl.CrosshairModule;
import client.zenthra.module.impl.FpsCounterModule;
import client.zenthra.module.impl.KeystrokesModule;
import client.zenthra.module.impl.MainMenuModule;
import client.zenthra.module.impl.PotionHudModule;
import client.zenthra.module.impl.ToggleSprintModule;
import client.zenthra.util.Draw;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.ConfirmScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;

/**
 * In-game modules menu ("Modules Zenthra" / "Zenthra Skills"), opened from the pause
 * menu or Right Shift: a compact glass window with a sidebar, a search field and one
 * card per module. Toggling and settings use the existing module system; changes
 * apply at once and are saved by the config manager.
 */
public class ZenthraScreen extends BaseScreen {
	private enum View { MODULES, PROFILES, PERFORMANCE, DIAGNOSTIC }

	private record NavItem(String label, ZIcon icon, View view, Category category, Runnable action) {}

	private record Tool(ZIcon icon, String label, Runnable action) {}

	/** Translation key of the menu name, also used for the pause-menu button. */
	public static final String TITLE_KEY = "zenthra.menu.title";
	private static View view = View.MODULES;
	private static Category category = null; // null = all

	/** Icon of each module card (by module id). */
	static final Map<String, ZIcon> MODULE_ICONS = new HashMap<>();

	static {
		String[][] pairs = {
			{"waypoints", "WAYPOINTS"}, {"hit_color", "HIT_COLOR"}, {"freelook", "FREELOOK"}, {"zoom", "ZOOM"},
			{"keystrokes", "KEYSTROKES"}, {"cps_counter", "CPS"}, {"fps_counter", "FPS"}, {"armor_hud", "ARMOR"},
			{"potion_hud", "POTION"}, {"crosshair", "CROSSHAIR"}, {"toggle_sprint", "SPRINT"}, {"direction_hud", "DIRECTION"},
			{"session_timer", "TIMER"}, {"scoreboard", "SCOREBOARD"}, {"status_indicators", "STATUS"}, {"main_menu", "MAIN_MENU"},
			{"inventory_hud", "INVENTORY"}, {"totem_counter", "TOTEM"}, {"ping_display", "PING"}, {"day_counter", "DAY"},
			{"clock", "CLOCK"}, {"speed_display", "SPEED"}, {"memory_display", "MEMORY"}, {"durability_alert", "DURABILITY"},
			{"nether_coords", "NETHER"}, {"break_reminder", "BREAK"},
		};
		for (String[] p : pairs) MODULE_ICONS.put(p[0], ZIcon.valueOf(p[1]));
	}

	static ZIcon iconOf(Module m) {
		return MODULE_ICONS.getOrDefault(m.id(), ZIcon.SETTINGS);
	}

	private static ZIcon iconOf(Category c) {
		return switch (c) {
			case HUD -> ZIcon.HUD;
			case PVP -> ZIcon.PVP;
			case CAMERA -> ZIcon.CAMERA;
			case UTILITY -> ZIcon.UTILITY;
			case WORLD -> ZIcon.WORLD;
		};
	}

	private EditBox search;
	private double scroll;
	private final List<NavItem> nav = new ArrayList<>();
	private final List<Tool> tools = new ArrayList<>();
	private final Map<Module, Float> toggleAnim = new HashMap<>();
	private final Map<Module, Long> toggledAt = new HashMap<>();
	private final Map<Object, Float> hover = new HashMap<>();
	private long switchedAt = System.currentTimeMillis();
	private long openedAt = System.currentTimeMillis();
	private String toast;
	private long toastAt;

	// Layout.
	private int sw;           // sidebar width
	private int cx, cw;       // content area
	private int gridTop, gridBottom;

	public ZenthraScreen(Screen parent) {
		super(Component.translatable(TITLE_KEY), parent);
	}

	private static boolean animated() {
		return ZenthraClient.modules().get(MainMenuModule.class).animated();
	}

	@Override
	protected void init() {
		layoutPanel(Mth.clamp((int) (width * 0.82f), 330, 560), Mth.clamp((int) (height * 0.86f), 220, 330));
		sw = Mth.clamp((int) (pw * 0.26f), 106, 132);
		cx = px + sw + 10;
		cw = pw - sw - 20;

		// Search field drawn inside our own rounded box.
		int toolsW = 4 * 18;
		int sx = cx + 16, sy = py + 12;
		search = editBox(sx, sy, cw - toolsW - 46, 10, "Rechercher un module…");
		search.setBordered(false);
		search.setResponder(s -> scroll = 0);
		search.visible = view == View.MODULES;

		nav.clear();
		nav.add(new NavItem("Tous les modules", ZIcon.ALL, View.MODULES, null, null));
		for (Category c : Category.values()) nav.add(new NavItem(c.label, iconOf(c), View.MODULES, c, null));
		nav.add(null); // separator
		nav.add(new NavItem("Profils rapides", ZIcon.PROFILES, View.PROFILES, null, null));
		nav.add(new NavItem("Performance", ZIcon.PERFORMANCE, View.PERFORMANCE, null, null));
		nav.add(new NavItem("Diagnostic", ZIcon.DIAGNOSTIC, View.DIAGNOSTIC, null, null));
		nav.add(new NavItem("Waypoints", ZIcon.WAYPOINTS, null, null, () -> Platform.setScreen(new WaypointsScreen(this))));

		tools.clear();
		tools.add(new Tool(ZIcon.HUD, "Éditer le HUD", () -> Platform.setScreen(new HudEditorScreen(this))));
		tools.add(new Tool(ZIcon.KEY, "Touches", () -> Platform.setScreen(Platform.keyBindsScreen(this))));
		tools.add(new Tool(ZIcon.SETTINGS, "Graphismes", () -> Platform.setScreen(Platform.videoSettingsScreen(this))));
		tools.add(new Tool(ZIcon.WORLD, "Packs de ressources", () -> Platform.setScreen(Platform.resourcePackScreen(this))));
	}

	@Override
	protected void zBackground(Gfx g, int mx, int my) {
		// Window: faint night scene behind dark glass.
		float s = Math.max((float) pw / 480, (float) ph / 270);
		g.scissor(px, py, px + pw, py + ph);
		g.texture(Ui.backgroundTexture(), px + (pw - Math.round(480 * s)) / 2, py + (ph - Math.round(270 * s)) / 2,
			Math.round(480 * s), Math.round(270 * s), 0, 0, 480, 270, 480, 270);
		g.endScissor();
		Ui.round(g, px, py, pw, ph, 0xC80A0612);
		Ui.roundOutline(g, px, py, pw, ph, 0x60B48AE8);
		Ui.roundOutline(g, px - 1, py - 1, pw + 2, ph + 2, 0x30A070F0);
		// Sidebar.
		Ui.round(g, px + 4, py + 4, sw, ph - 8, 0x700D0818);
		Ui.roundOutline(g, px + 4, py + 4, sw, ph - 8, 0x30B48AE8);
		// Search box.
		if (view == View.MODULES) {
			int bw = cw - 4 * 18 - 26;
			Ui.glass(g, cx, py + 7, bw, 20, 0x90120A1E, search.isFocused() ? 0.6f : 0);
			Ui.icon(g, ZIcon.SEARCH, cx + 4, py + 11, 12, false);
		}
	}

	@Override
	protected void renderContent(Gfx g, int mx, int my, float pt) {
		boolean anim = animated();
		renderSidebar(g, mx, my, anim);
		renderTopBar(g, mx, my, anim);

		float t = anim ? Math.min(1f, (System.currentTimeMillis() - switchedAt) / 220f) : 1f;
		float ease = 1 - (1 - t) * (1 - t);
		int top = py + 32;
		g.push();
		g.translate(0, (1 - ease) * 6);
		switch (view) {
			case MODULES -> renderModules(g, mx, my, top, anim);
			case PROFILES -> renderProfiles(g, mx, my, top);
			case PERFORMANCE -> renderPerformance(g, mx, my, top);
			case DIAGNOSTIC -> renderDiagnostic(g, top);
		}
		g.pop();

		if (toast != null && System.currentTimeMillis() - toastAt < 2200) {
			int w = font.width(toast) + 24;
			int x = cx + (cw - w) / 2, y = py + ph - 52;
			Ui.glass(g, x, y, w, 18, 0xE0160E26, 0);
			Ui.icon(g, ZIcon.CHECK, x + 5, y + 4, 10, true);
			g.text(toast, x + 18, y + 5, Ui.TEXT, false);
		}
	}

	// ---- Sidebar ----

	private void renderSidebar(Gfx g, int mx, int my, boolean anim) {
		int x = px + 8, w = sw - 8;
		// Logo.
		int lw = w - 8, lh = lw * 220 / 640;
		g.texture(ZenthraTitleScreen.logoTexture(), x + 4, py + 9, lw, lh, 0, 0, 640, 220, 640, 220);

		int y = py + 14 + lh;
		int itemH = Mth.clamp((ph - lh - 70) / 11, 13, 17);
		for (int i = 0; i < nav.size(); i++) {
			NavItem item = nav.get(i);
			if (item == null) {
				g.fill(x + 6, y + 2, x + w - 6, y + 3, 0x30B48AE8);
				y += 6;
				continue;
			}
			boolean active = item.view() == view && (view != View.MODULES || item.category() == category);
			boolean over = Ui.inside(mx, my, x, y, w, itemH);
			float hv = hover(item, over, anim);
			if (active) {
				Ui.glass(g, x, y, w, itemH, 0xA03A2266, 0.4f);
			} else if (hv > 0.02f) {
				Ui.round(g, x, y, w, itemH, Ui.alpha(0x30, hv) | 0xB48AE8);
			}
			int is = itemH - 5;
			Ui.icon(g, item.icon(), x + 5, y + (itemH - is) / 2, is, active || over);
			g.text(Ui.fit(item.label(), w - is - 14), x + is + 10, y + (itemH - 8) / 2, active ? Ui.TEXT : Draw.lerpColor(Ui.MUTED, Ui.TEXT, hv), false);
			region(x, y, w, itemH, () -> {
				if (item.action() != null) item.action().run();
				else select(item.view(), item.category());
			});
			y += itemH + 1;
		}

		// Profile at the bottom.
		int pyy = py + ph - 30;
		g.fill(x + 4, pyy - 4, x + w - 4, pyy - 3, 0x30B48AE8);
		Ui.face(g, x + 4, pyy + 2, 18);
		Ui.roundOutline(g, x + 3, pyy + 1, 20, 20, 0x40B48AE8);
		String name = Ui.fit(Platform.playerName(), w - 44);
		g.text(name, x + 27, pyy + 3, Ui.TEXT, false);
		boolean online = !Platform.isDemo();
		g.fill(x + 27, pyy + 14, x + 31, pyy + 18, online ? Ui.GREEN : 0xFF8A8296);
		g.text(online ? "En ligne" : "Mode démo", x + 34, pyy + 12, Ui.MUTED, false);
	}

	// ---- Top bar: search, tools, close ----

	private void renderTopBar(Gfx g, int mx, int my, boolean anim) {
		int x = px + pw - 22;
		boolean overClose = Ui.inside(mx, my, x, py + 7, 18, 18);
		Ui.glass(g, x, py + 7, 18, 18, 0x90120A1E, hover("close", overClose, anim));
		Ui.icon(g, ZIcon.CLOSE, x + 3, py + 10, 12, overClose);
		region(x, py + 7, 18, 18, this::onClose);
		if (view != View.MODULES) return;
		for (int i = tools.size() - 1; i >= 0; i--) {
			Tool tool = tools.get(i);
			x -= 20;
			boolean over = Ui.inside(mx, my, x, py + 7, 18, 18);
			Ui.glass(g, x, py + 7, 18, 18, 0x90120A1E, hover(tool, over, anim));
			Ui.icon(g, tool.icon(), x + 3, py + 10, 12, over);
			region(x, py + 7, 18, 18, tool.action());
			if (over) tooltip(g, tool.label(), mx, my);
		}
	}

	private void tooltip(Gfx g, String text, int mx, int my) {
		int w = font.width(text) + 8;
		int x = Math.min(mx + 8, width - w - 2), y = my + 12;
		Ui.round(g, x, y, w, 13, 0xF0160E26);
		Ui.roundOutline(g, x, y, w, 13, Ui.BORDER);
		g.text(text, x + 4, y + 3, Ui.TEXT, false);
	}

	// ---- Modules ----

	private List<Module> visibleModules() {
		String q = search.getValue().toLowerCase(Locale.ROOT).trim();
		return ZenthraClient.modules().all().stream()
			.filter(m -> category == null || m.category() == category)
			.filter(m -> q.isEmpty() || m.name().toLowerCase(Locale.ROOT).contains(q) || m.description().toLowerCase(Locale.ROOT).contains(q))
			.toList();
	}

	private void renderModules(Gfx g, int mx, int my, int top, boolean anim) {
		// Header.
		ZIcon headIcon = category == null ? ZIcon.ALL : iconOf(category);
		Ui.icon(g, headIcon, cx, top + 1, 18, true);
		g.push();
		g.translate(cx + 24, top + 1);
		g.scale(1.5f);
		g.text(category == null ? "Modules" : category.label, 0, 0, Ui.TEXT, true);
		g.pop();
		long active = ZenthraClient.modules().all().stream().filter(Module::isEnabled).count();
		Ui.pill(g, cx + cw, top + 3, active + (active > 1 ? " modules actifs" : " module actif"), Ui.GREEN);
		g.text(Ui.fit(category == null ? "Personnalise ton expérience avec les modules Zenthra." : "Modules de la catégorie " + category.label + ".", cw - 24),
			cx + 24, top + 15, Ui.MUTED, false);

		List<Module> list = visibleModules();
		gridTop = top + 30;
		gridBottom = py + ph - 32;
		int cols = cw >= 300 ? 2 : 1;
		int gap = 6;
		int colW = (cw - (cols - 1) * gap) / cols;
		int cardH = 36;
		int rows = (list.size() + cols - 1) / cols;
		scroll = Mth.clamp(scroll, 0, Math.max(0, rows * (cardH + gap) - gap - (gridBottom - gridTop)));

		g.scissor(cx - 2, gridTop - 2, cx + cw + 2, gridBottom);
		boolean inGrid = my >= gridTop && my < gridBottom;
		for (int i = 0; i < list.size(); i++) {
			Module m = list.get(i);
			int x = cx + (i % cols) * (colW + gap);
			int y = gridTop + (i / cols) * (cardH + gap) - (int) scroll;
			if (y + cardH < gridTop || y > gridBottom) continue;
			renderCard(g, m, x, y, colW, cardH, mx, my, inGrid, anim);
		}
		g.endScissor();
		if (rows * (cardH + gap) - gap > gridBottom - gridTop) {
			// Scroll bar.
			int trackH = gridBottom - gridTop;
			int total = rows * (cardH + gap) - gap;
			int barH = Math.max(16, trackH * trackH / total);
			int barY = gridTop + (int) ((trackH - barH) * (scroll / Math.max(1, total - trackH)));
			Ui.round(g, cx + cw + 3, barY, 3, barH, 0x80B48AE8);
		}
		if (list.isEmpty()) g.text("Aucun module ne correspond à « " + search.getValue() + " ».", cx, gridTop + 4, Ui.MUTED, false);

		renderBottomBar(g, mx, my, list, anim);
	}

	private void renderCard(Gfx g, Module m, int x, int y, int w, int h, int mx, int my, boolean inGrid, boolean anim) {
		boolean over = inGrid && Ui.inside(mx, my, x, y, w, h);
		float hv = hover(m, over, anim);
		float on = toggleAnim.getOrDefault(m, m.isEnabled() ? 1f : 0f);
		on = Ui.approach(on, m.isEnabled() ? 1 : 0, anim);
		toggleAnim.put(m, on);

		Ui.glass(g, x, y, w, h, Draw.lerpColor(Ui.GLASS_LIGHT, Ui.GLASS_HOVER, hv), hv);
		// Pulse right after toggling.
		Long at = toggledAt.get(m);
		if (anim && at != null) {
			float p = (System.currentTimeMillis() - at) / 400f;
			if (p < 1) Ui.roundOutline(g, x - 2, y - 2, w + 4, h + 4, Ui.alpha(0xA0, 1 - p) | 0xC9A6FF);
		}
		// Icon tile.
		Ui.round(g, x + 6, y + 6, 24, 24, Draw.lerpColor(0x60201433, 0x90402468, on));
		Ui.roundOutline(g, x + 6, y + 6, 24, 24, Draw.lerpColor(0x30B48AE8, 0x90C9A6FF, on));
		Ui.icon(g, iconOf(m), x + 10, y + 10, 16, on > 0.5f || over);

		int textX = x + 36, textW = w - 36 - 44;
		g.text(Ui.fit(m.name(), textW), textX, y + 6, Ui.TEXT, false);
		String[] desc = Ui.wrap(m.description(), textW, 2);
		for (int i = 0; i < desc.length; i++) g.text(desc[i], textX, y + 17 + i * 9, Ui.MUTED, false);

		Ui.toggle(g, x + w - 40, y + (h - 10) / 2, on);
		Ui.icon(g, ZIcon.CHEVRON, x + w - 16, y + (h - 10) / 2, 10, over);

		if (inGrid) {
			region(x, y, w - 46, h, () -> openSettings(m));
			region(x + w - 46, y, 30, h, () -> toggle(m));
			region(x + w - 16, y, 16, h, () -> openSettings(m));
		}
	}

	private void toggle(Module m) {
		m.toggle();
		toggledAt.put(m, System.currentTimeMillis());
		ZenthraClient.config().markDirty();
	}

	private void openSettings(Module m) {
		Platform.setScreen(new ModuleSettingsScreen(this, m));
	}

	private void renderBottomBar(Gfx g, int mx, int my, List<Module> list, boolean anim) {
		int y = py + ph - 26;
		String[] labels = {"Tout activer", "Tout désactiver", "Réinitialiser", "Appliquer"};
		// Narrow window: secondary buttons become icons (with a tooltip) so nothing overlaps.
		int full = 12;
		for (String l : labels) full += font.width(l) + 28;
		boolean compact = full > cw;
		boolean veryCompact = compact && 3 * 24 + font.width("Appliquer") + 28 > cw;
		int x = cx;
		x += bottomButton(g, mx, my, x, y, ZIcon.CHECK, labels[0], false, compact, anim, () -> setAll(list, true)) + 4;
		bottomButton(g, mx, my, x, y, ZIcon.CLOSE, labels[1], false, compact, anim, () -> setAll(list, false));
		int right = cx + cw;
		int applyW = veryCompact ? 20 : font.width("Appliquer") + 28;
		bottomButton(g, mx, my, right - applyW, y, ZIcon.CHECK, labels[3], true, veryCompact, anim, () -> {
			ZenthraClient.config().save();
			showToast("Réglages enregistrés");
		});
		int resetW = compact ? 20 : font.width("Réinitialiser") + 28;
		bottomButton(g, mx, my, right - applyW - 4 - resetW, y, ZIcon.RESET, labels[2], false, compact, anim, this::confirmReset);
	}

	/** Returns the width used; an icon-only button shows its label as a tooltip. */
	private int bottomButton(Gfx g, int mx, int my, int x, int y, ZIcon icon, String label, boolean primary, boolean iconOnly, boolean anim, Runnable action) {
		int w = iconOnly ? 20 : font.width(label) + 28, h = 20;
		boolean over = Ui.inside(mx, my, x, y, w, h);
		float hv = hover(label, over, anim);
		int body = primary ? Draw.lerpColor(0xC0503090, 0xE06A40B8, hv) : Draw.lerpColor(0x90120A1E, Ui.GLASS_HOVER, hv);
		Ui.glass(g, x, y, w, h, body, primary ? Math.max(0.5f, hv) : hv);
		Ui.icon(g, icon, x + 5, y + 5, 10, primary || over);
		if (iconOnly) {
			if (over) tooltip(g, label, mx, my);
		} else {
			g.text(label, x + 20, y + 6, Ui.TEXT, false);
		}
		region(x, y, w, h, action);
		return w;
	}

	/** "Tout activer" / "Tout désactiver" apply to the modules currently shown (category and search). */
	private void setAll(List<Module> list, boolean enabled) {
		int changed = 0;
		for (Module m : list) {
			if (m.isEnabled() != enabled) {
				m.setEnabled(enabled);
				toggledAt.put(m, System.currentTimeMillis());
				changed++;
			}
		}
		ZenthraClient.config().markDirty();
		showToast(changed == 0 ? "Aucun changement" : changed + (enabled ? " module(s) activé(s)" : " module(s) désactivé(s)"));
	}

	private void confirmReset() {
		Platform.setScreen(new ConfirmScreen(
			confirmed -> {
				if (confirmed) {
					for (Module m : ZenthraClient.modules().all()) m.resetToDefaults();
					ZenthraClient.config().markDirty();
					showToast("Modules réinitialisés");
				}
				Platform.setScreen(this);
			},
			Component.literal("Réinitialiser tous les modules ?"),
			Component.literal("Réglages, positions du HUD et activation reviennent aux valeurs d'origine. Tes waypoints sont conservés.")));
	}

	private void showToast(String text) {
		toast = text;
		toastAt = System.currentTimeMillis();
	}

	private float hover(Object key, boolean over, boolean anim) {
		float v = Ui.approach(hover.getOrDefault(key, 0f), over ? 1 : 0, anim);
		hover.put(key, v);
		return v;
	}

	private void select(View v, Category c) {
		view = v;
		category = c;
		scroll = 0;
		search.visible = v == View.MODULES;
		switchedAt = System.currentTimeMillis();
	}

	/** Opens the menu directly on the diagnostic view (used by the self-test). */
	public ZenthraScreen showDiagnostic() {
		view = View.DIAGNOSTIC;
		category = null;
		return this;
	}

	// ---- Other views ----

	private void header(Gfx g, ZIcon icon, String title, String subtitle, int top) {
		Ui.icon(g, icon, cx, top + 1, 18, true);
		g.push();
		g.translate(cx + 24, top + 1);
		g.scale(1.5f);
		g.text(title, 0, 0, Ui.TEXT, true);
		g.pop();
		g.text(subtitle, cx + 24, top + 15, Ui.MUTED, false);
	}

	/** Real measurements from the running game (see Telemetry). */
	private void renderDiagnostic(Gfx g, int top) {
		header(g, ZIcon.DIAGNOSTIC, "Diagnostic", "Mesures réelles du jeu en cours.", top);
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
		int valueX = cx + 8 + labelW + 12;
		int y = top + 30;
		for (String[] r : rows) {
			Ui.glass(g, cx, y, cw, 18, Ui.GLASS_LIGHT, 0);
			g.text(r[0], cx + 8, y + 5, Ui.MUTED, false);
			g.text(Ui.fit(r[1], cx + cw - valueX - 6), valueX, y + 5, Ui.TEXT, false);
			y += 21;
		}
		Ui.round(g, cx, y + 2, cw, 4, 0xFF3A3346);
		Ui.round(g, cx, y + 2, Math.max(4, (int) (cw * Math.min(1.0, (double) used / max))), 4, Ui.ACCENT);
	}

	private void renderProfiles(Gfx g, int mx, int my, int top) {
		header(g, ZIcon.PROFILES, "Profils rapides", "Active d'un clic un ensemble de modules.", top);
		record Preset(String name, String desc, Set<Class<? extends Module>> enabled) {}
		List<Preset> presets = List.of(
			new Preset("PvP", "Keystrokes, CPS, FPS, armure, potions, viseur, sprint.",
				Set.of(KeystrokesModule.class, CpsCounterModule.class, FpsCounterModule.class, ArmorHudModule.class, PotionHudModule.class, CrosshairModule.class, ToggleSprintModule.class)),
			new Preset("Minimal", "Uniquement le compteur de FPS.", Set.of(FpsCounterModule.class)),
			new Preset("Aucun HUD", "Désactive tous les éléments affichés à l'écran.", Set.of()));
		int y = top + 30;
		for (Preset p : presets) {
			boolean over = Ui.inside(mx, my, cx, y, cw, 32);
			Ui.glass(g, cx, y, cw, 32, Draw.lerpColor(Ui.GLASS_LIGHT, Ui.GLASS_HOVER, hover(p.name(), over, animated())), hover.get(p.name()));
			g.text(p.name(), cx + 8, y + 6, Ui.TEXT, false);
			g.text(Ui.fit(p.desc(), cw - 80), cx + 8, y + 18, Ui.MUTED, false);
			g.text("Appliquer", cx + cw - 8 - font.width("Appliquer"), y + 12, Ui.ACCENT_LIGHT, false);
			region(cx, y, cw, 32, () -> {
				for (Module m : ZenthraClient.modules().all()) {
					if (m.category() == Category.HUD || p.enabled().contains(m.getClass()) || m instanceof CrosshairModule || m instanceof ToggleSprintModule) {
						m.setEnabled(p.enabled().contains(m.getClass()));
					}
				}
				ZenthraClient.config().markDirty();
				showToast("Profil « " + p.name() + " » appliqué");
			});
			y += 36;
		}
		g.wrappedText("Les autres modules (zoom, free look, waypoints…) ne sont pas modifiés.", cx, y + 2, cw, Ui.MUTED);
		int ry = y + 24;
		boolean over = Ui.inside(mx, my, cx, ry, cw, 22);
		Ui.glass(g, cx, ry, cw, 22, over ? 0x60EF4444 : 0x30EF4444, 0);
		Ui.icon(g, ZIcon.RESET, cx + 7, ry + 6, 10, true);
		g.text("Réinitialiser tous les modules", cx + 22, ry + 7, 0xFFFCA5A5, false);
		region(cx, ry, cw, 22, this::confirmReset);
	}

	private void renderPerformance(Gfx g, int mx, int my, int top) {
		header(g, ZIcon.PERFORMANCE, "Performance", "FPS actuels : " + minecraft.getFps() + " · clique pour changer une option.", top);
		int y = top + 30;
		for (PerfOption option : Platform.perfOptions()) {
			boolean over = Ui.inside(mx, my, cx, y, cw, 20);
			float hv = hover(option.label(), over, animated());
			Ui.glass(g, cx, y, cw, 20, Draw.lerpColor(Ui.GLASS_LIGHT, Ui.GLASS_HOVER, hv), hv);
			g.text(option.label(), cx + 8, y + 6, Ui.TEXT, false);
			String value = option.value().get();
			g.text(value, cx + cw - 8 - font.width(value), y + 6, Ui.ACCENT_LIGHT, false);
			region(cx, y, cw, 20, () -> {
				option.next().run();
				minecraft.options.save();
			});
			y += 23;
		}
		g.text("Les gains dépendent de ton matériel.", cx, y + 4, Ui.MUTED, false);
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
