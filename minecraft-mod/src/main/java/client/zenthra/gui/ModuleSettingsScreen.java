package client.zenthra.gui;

import client.zenthra.ZenthraClient;
import client.zenthra.compat.Gfx;
import client.zenthra.compat.Platform;
import client.zenthra.module.HudModule;
import client.zenthra.module.Module;
import client.zenthra.module.impl.CrosshairModule;
import client.zenthra.module.impl.FreeLookModule;
import client.zenthra.module.impl.MainMenuModule;
import client.zenthra.module.impl.ToggleSprintModule;
import client.zenthra.module.impl.WaypointsModule;
import client.zenthra.module.impl.ZoomModule;
import client.zenthra.module.setting.BooleanSetting;
import client.zenthra.module.setting.ChoiceSetting;
import client.zenthra.module.setting.ColorSetting;
import client.zenthra.module.setting.NumberSetting;
import client.zenthra.module.setting.Setting;
import client.zenthra.util.Draw;
import java.util.HashMap;
import java.util.Map;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;

/** Settings of a single module: only the options the module really has, plus its key binding if any. */
public class ModuleSettingsScreen extends BaseScreen {
	private static final int SLIDER_W = 110;
	private static final int ROW_H = 22;

	private final Module module;
	private final KeyMapping key;
	private final Map<Object, Float> anim = new HashMap<>();
	private final long openedAt = System.currentTimeMillis();
	private NumberSetting dragging;
	private int dragX;
	private double scroll;

	public ModuleSettingsScreen(Screen parent, Module module) {
		super(Component.literal(module.name()), parent);
		this.module = module;
		var keys = ZenthraClient.keys();
		this.key = module instanceof ZoomModule ? keys.zoom
			: module instanceof FreeLookModule ? keys.freelook
			: module instanceof WaypointsModule ? keys.addWaypoint
			: module instanceof ToggleSprintModule ? keys.toggleSprint
			: null;
	}

	private static boolean animated() {
		return ZenthraClient.modules().get(MainMenuModule.class).animated();
	}

	@Override
	protected void init() {
		layoutPanel(Mth.clamp((int) (width * 0.62f), 290, 420), Mth.clamp((int) (height * 0.84f), 200, 300));
	}

	private void changed() {
		module.onSettingsChanged();
		ZenthraClient.config().markDirty();
	}

	private float ease(Object key, float target, boolean animate) {
		float v = Ui.approach(anim.getOrDefault(key, target), target, animate);
		anim.put(key, v);
		return v;
	}

	@Override
	protected void zBackground(Gfx g, int mx, int my) {
		float s = Math.max((float) pw / 480, (float) ph / 270);
		g.scissor(px, py, px + pw, py + ph);
		g.texture(Ui.backgroundTexture(), px + (pw - Math.round(480 * s)) / 2, py + (ph - Math.round(270 * s)) / 2,
			Math.round(480 * s), Math.round(270 * s), 0, 0, 480, 270, 480, 270);
		g.endScissor();
		Ui.round(g, px, py, pw, ph, 0xD00A0612);
		Ui.roundOutline(g, px, py, pw, ph, 0x60B48AE8);
		Ui.roundOutline(g, px - 1, py - 1, pw + 2, ph + 2, 0x30A070F0);
	}

	@Override
	protected void renderContent(Gfx g, int mx, int my, float pt) {
		boolean animate = animated();
		float open = animate ? Math.min(1f, (System.currentTimeMillis() - openedAt) / 180f) : 1f;
		g.push();
		g.translate(0, (1 - open) * 8);

		int x = px + 12, w = pw - 24;
		boolean preview = module instanceof CrosshairModule;

		// Header: icon, name, category, on/off switch.
		float on = ease("enabled", module.isEnabled() ? 1 : 0, animate);
		Ui.round(g, x, py + 10, 28, 28, Draw.lerpColor(0x60201433, 0x90402468, on));
		Ui.roundOutline(g, x, py + 10, 28, 28, Draw.lerpColor(0x30B48AE8, 0x90C9A6FF, on));
		Ui.icon(g, ZenthraScreen.iconOf(module), x + 5, py + 15, 18, on > 0.5f);
		g.push();
		g.translate(x + 36, py + 11);
		g.scale(1.3f);
		g.text(module.name(), 0, 0, Ui.TEXT, true);
		g.pop();
		g.text(module.category().label, x + 36, py + 27, Ui.ACCENT_LIGHT, false);
		g.text(module.isEnabled() ? "Activé" : "Désactivé", x + w - 28 - font.width(module.isEnabled() ? "Activé" : "Désactivé"), py + 15,
			module.isEnabled() ? Ui.TEXT : Ui.MUTED, false);
		Ui.toggle(g, x + w - 22, py + 14, on);
		region(x + w - 80, py + 10, 80, 18, () -> {
			module.toggle();
			changed();
		});

		int textW = preview ? w - 58 : w;
		int y = py + 44;
		for (String line : Ui.wrap(module.description(), textW, 2)) {
			g.text(line, x, y, Ui.MUTED, false);
			y += 10;
		}
		if (module.hint() != null) {
			for (String line : Ui.wrap(module.hint(), textW, 3)) {
				g.text(line, x, y, 0xFFC4B5FD, false);
				y += 10;
			}
		}
		if (preview) {
			// Live preview: updates as soon as a setting changes.
			int bx = x + w - 50, by = py + 42, bs = 48;
			Ui.round(g, bx, by, bs, bs, 0xFF5A7FA8);
			g.fill(bx, by + bs * 2 / 3, bx + bs, by + bs - 1, 0xFF4E7A3A);
			Ui.roundOutline(g, bx, by, bs, bs, Ui.BORDER);
			g.scissor(bx, by, bx + bs, by + bs);
			((CrosshairModule) module).renderAt(g, bx + bs / 2, by + bs / 2);
			g.endScissor();
			y = Math.max(y, by + bs);
		}

		// Settings.
		int top = y + 6, bottom = py + ph - 32;
		int rows = module.settings().size() + (key != null ? 1 : 0);
		scroll = Mth.clamp(scroll, 0, Math.max(0, rows * ROW_H - (bottom - top)));
		g.scissor(x - 1, top, x + w + 1, bottom);
		int ry = top - (int) scroll;
		boolean interactive = my >= top && my < bottom;
		if (key != null) {
			if (ry + ROW_H > top && ry < bottom) renderKeyRow(g, mx, my, x, ry, w, interactive, animate);
			ry += ROW_H;
		}
		for (Setting<?> s : module.settings()) {
			if (ry + ROW_H > top && ry < bottom) renderSetting(g, mx, my, s, x, ry, w, interactive, animate);
			ry += ROW_H;
		}
		g.endScissor();
		if (rows == 0) g.text("Ce module n'a pas de réglage.", x, top + 4, Ui.MUTED, false);

		// Bottom: reset and back.
		int by = py + ph - 26;
		int resetW = font.width("Réinitialiser") + 28;
		bottomButton(g, mx, my, x, by, resetW, ZIcon.RESET, "Réinitialiser", false, animate, () -> {
			module.resetSettings();
			if (module instanceof HudModule hud) hud.resetPosition();
			changed();
		});
		int backW = font.width("Retour") + 28;
		bottomButton(g, mx, my, x + w - backW, by, backW, ZIcon.CHECK, "Retour", true, animate, this::onClose);
		g.pop();
	}

	private void bottomButton(Gfx g, int mx, int my, int x, int y, int w, ZIcon icon, String label, boolean primary, boolean animate, Runnable action) {
		boolean over = Ui.inside(mx, my, x, y, w, 20);
		float hv = ease(label, over ? 1 : 0, animate);
		int body = primary ? Draw.lerpColor(0xC0503090, 0xE06A40B8, hv) : Draw.lerpColor(0x90120A1E, Ui.GLASS_HOVER, hv);
		Ui.glass(g, x, y, w, 20, body, primary ? Math.max(0.5f, hv) : hv);
		Ui.icon(g, icon, x + 6, y + 5, 10, primary || over);
		g.text(label, x + 20, y + 6, Ui.TEXT, false);
		region(x, y, w, 20, action);
	}

	private void row(Gfx g, int mx, int my, int x, int y, int w, String name, boolean animate) {
		boolean over = Ui.inside(mx, my, x, y, w, ROW_H - 2);
		float hv = ease("row:" + name, over ? 1 : 0, animate);
		Ui.round(g, x, y, w, ROW_H - 2, Draw.lerpColor(0x50120A1E, 0x802A1A45, hv));
		g.text(name, x + 8, y + 6, Ui.TEXT, false);
	}

	private void renderKeyRow(Gfx g, int mx, int my, int x, int y, int w, boolean interactive, boolean animate) {
		row(g, mx, my, x, y, w, "Touche", animate);
		String name = key.getTranslatedKeyMessage().getString();
		int bw = font.width(name) + 26;
		int bx = x + w - bw - 4;
		Ui.glass(g, bx, y + 2, bw, 16, 0x90120A1E, Ui.inside(mx, my, bx, y + 2, bw, 16) ? 1 : 0);
		Ui.icon(g, ZIcon.KEY, bx + 4, y + 5, 10, true);
		g.text(name, bx + 18, y + 6, Ui.TEXT, false);
		if (interactive) region(bx, y + 2, bw, 16, () -> Platform.setScreen(Platform.keyBindsScreen(this)));
	}

	private void renderSetting(Gfx g, int mx, int my, Setting<?> s, int x, int y, int w, boolean interactive, boolean animate) {
		row(g, mx, my, x, y, w, s.name(), animate);
		int right = x + w - 6;
		if (s instanceof BooleanSetting b) {
			Ui.toggle(g, right - 20, y + 5, ease(b, b.get() ? 1 : 0, animate));
			if (interactive) region(right - 60, y, 60, ROW_H - 2, () -> {
				b.toggle();
				changed();
			});
		} else if (s instanceof NumberSetting n) {
			String v = n.display();
			int valueW = Math.max(36, font.width(v) + 4);
			int sx = right - valueW - SLIDER_W - 6;
			Ui.round(g, sx, y + 8, SLIDER_W, 4, 0xFF3A3346);
			int knob = sx + (int) Math.round(n.fraction() * SLIDER_W);
			if (knob - sx >= 3) Ui.round(g, sx, y + 8, knob - sx, 4, Ui.ACCENT);
			boolean overKnob = dragging == n || Ui.inside(mx, my, sx - 4, y, SLIDER_W + 8, ROW_H - 2);
			Ui.round(g, knob - 3, y + 5, 6, 10, overKnob ? 0xFFFFFFFF : 0xFFE6DCF7);
			if (overKnob) Ui.roundOutline(g, knob - 4, y + 4, 8, 12, 0x80C9A6FF);
			g.text(v, right - font.width(v), y + 6, Ui.ACCENT_LIGHT, false);
			if (interactive) region(sx - 4, y, SLIDER_W + 8, ROW_H - 2, () -> {
				dragging = n;
				dragX = sx;
			});
		} else if (s instanceof ColorSetting c) {
			int count = ColorSetting.PRESETS.length;
			int sx = right - count * 13 + 3;
			for (int i = 0; i < count; i++) {
				int col = ColorSetting.PRESETS[i];
				int cx = sx + i * 13;
				boolean selected = (c.get() & 0xFFFFFF) == (col & 0xFFFFFF);
				Ui.round(g, cx, y + 5, 10, 10, col | 0xFF000000);
				if (selected) Ui.roundOutline(g, cx - 2, y + 3, 14, 14, 0xFFFFFFFF);
				if (interactive) region(cx - 1, y + 3, 12, 14, () -> {
					c.set(col);
					changed();
				});
			}
		} else if (s instanceof ChoiceSetting ch) {
			String v = ch.display();
			int bw = font.width(v) + 24;
			int bx = right - bw;
			boolean over = Ui.inside(mx, my, bx, y + 2, bw, 16);
			Ui.glass(g, bx, y + 2, bw, 16, 0x90120A1E, ease(ch, over ? 1 : 0, animate));
			g.text(v, bx + 7, y + 6, Ui.ACCENT_LIGHT, false);
			Ui.icon(g, ZIcon.CHEVRON, bx + bw - 13, y + 5, 10, over);
			if (interactive) region(bx, y + 2, bw, 16, () -> {
				ch.cycle();
				changed();
			});
		}
	}

	@Override
	protected boolean zClick(double mx, double my, int button) {
		boolean r = super.zClick(mx, my, button);
		if (dragging != null) zDrag(mx, my, button);
		return r;
	}

	@Override
	protected boolean zDrag(double mx, double my, int button) {
		if (dragging == null) return false;
		dragging.setFraction((mx - dragX) / SLIDER_W);
		module.onSettingsChanged();
		return true;
	}

	@Override
	protected boolean zRelease(double mx, double my, int button) {
		if (dragging == null) return false;
		dragging = null;
		changed();
		return true;
	}

	@Override
	protected boolean zScroll(double mx, double my, double amount) {
		scroll -= amount * 16;
		return true;
	}
}
