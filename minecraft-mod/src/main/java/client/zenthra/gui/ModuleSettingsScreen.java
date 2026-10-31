package client.zenthra.gui;

import client.zenthra.ZenthraClient;
import client.zenthra.module.HudModule;
import client.zenthra.module.Module;
import client.zenthra.module.impl.CrosshairModule;
import client.zenthra.module.setting.BooleanSetting;
import client.zenthra.module.setting.ChoiceSetting;
import client.zenthra.module.setting.ColorSetting;
import client.zenthra.module.setting.NumberSetting;
import client.zenthra.module.setting.Setting;
import client.zenthra.compat.Gfx;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;

/** Settings of a single module. */
public class ModuleSettingsScreen extends BaseScreen {
	private static final int SLIDER_W = 120;

	private final Module module;
	private NumberSetting dragging;
	private int dragX;
	private double scroll;

	public ModuleSettingsScreen(Screen parent, Module module) {
		super(Component.literal(module.name()), parent);
		this.module = module;
	}

	@Override
	protected void init() {
		layoutPanel(400, 300);
		int by = py + ph - 26;
		button(module.isEnabled() ? "Désactiver" : "Activer", px + 10, by, 90, 20, b -> {
			module.toggle();
			changed();
			b.setMessage(Component.literal(module.isEnabled() ? "Désactiver" : "Activer"));
		});
		button("Réinitialiser", px + 104, by, 90, 20, b -> {
			module.resetSettings();
			if (module instanceof HudModule hud) hud.resetPosition();
			changed();
		});
		button("Retour", px + pw - 100, by, 90, 20, b -> onClose());
	}

	private void changed() {
		module.onSettingsChanged();
		ZenthraClient.config().markDirty();
	}

	@Override
	protected void renderContent(Gfx g, int mx, int my, float pt) {
		int x = px + 12, w = pw - 24;
		boolean preview = module instanceof CrosshairModule;
		g.text(module.name(), x, py + 10, TEXT, false);
		g.text(module.category().label, x + font.width(module.name()) + 8, py + 10, ACCENT, false);
		g.wrappedText(module.description(), x, py + 24, preview ? w - 60 : w, MUTED);
		if (preview) {
			// Live preview: updates as soon as a setting changes.
			int bx = px + pw - 60, by = py + 6, bs = 48;
			g.fill(bx, by, bx + bs, by + bs, 0xFF5A7FA8);
			g.fill(bx, by + bs * 2 / 3, bx + bs, by + bs, 0xFF4E7A3A);
			g.outline(bx, by, bs, bs, BORDER);
			g.scissor(bx, by, bx + bs, by + bs);
			((CrosshairModule) module).renderAt(g, bx + bs / 2, by + bs / 2);
			g.endScissor();
		}
		// Below the live preview box when there is one.
		int top = preview ? py + 60 : py + 40;
		if (module.hint() != null) {
			g.wrappedText(module.hint(), x, top, w, 0xFFC4B5FD);
			top += font.wordWrapHeight(Component.literal(module.hint()), w) + 6;
		}
		int bottom = py + ph - 32;
		int rowH = 22;
		double maxScroll = Math.max(0, module.settings().size() * rowH - (bottom - top));
		scroll = Mth.clamp(scroll, 0, maxScroll);

		g.scissor(x, top, x + w, bottom);
		int y = top - (int) scroll;
		for (Setting<?> s : module.settings()) {
			if (y + rowH > top && y < bottom) renderSetting(g, mx, my, s, x, y, w, my >= top && my < bottom);
			y += rowH;
		}
		g.endScissor();
		if (module.settings().isEmpty()) g.text("Ce module n'a pas de réglage.", x, top, MUTED, false);
	}

	private void renderSetting(Gfx g, int mx, int my, Setting<?> s, int x, int y, int w, boolean interactive) {
		g.text(s.name(), x, y + 6, TEXT, false);
		int right = x + w;
		if (s instanceof BooleanSetting b) {
			drawToggle(g, right - 22, y + 5, b.get());
			if (interactive) region(right - 60, y, 60, 20, () -> {
				b.toggle();
				changed();
			});
		} else if (s instanceof NumberSetting n) {
			int sx = right - SLIDER_W - 50;
			g.fill(sx, y + 9, sx + SLIDER_W, y + 11, 0xFF3A3A44);
			int knob = sx + (int) Math.round(n.fraction() * SLIDER_W);
			g.fill(sx, y + 9, knob, y + 11, ACCENT);
			g.fill(knob - 2, y + 5, knob + 2, y + 15, 0xFFFFFFFF);
			String v = n.display();
			g.text(v, right - font.width(v), y + 6, MUTED, false);
			if (interactive) region(sx - 4, y, SLIDER_W + 8, 20, () -> {
				dragging = n;
				dragX = sx;
			});
		} else if (s instanceof ColorSetting c) {
			int count = ColorSetting.PRESETS.length;
			int sx = right - count * 12;
			for (int i = 0; i < count; i++) {
				int col = ColorSetting.PRESETS[i];
				int cx = sx + i * 12;
				if ((c.get() & 0xFFFFFF) == (col & 0xFFFFFF)) g.fill(cx - 1, y + 3, cx + 11, y + 15, 0xFFFFFFFF);
				g.fill(cx, y + 4, cx + 10, y + 14, col);
				if (interactive) region(cx, y + 3, 11, 12, () -> {
					c.set(col);
					changed();
				});
			}
		} else if (s instanceof ChoiceSetting ch) {
			String v = ch.display();
			int bw = font.width(v) + 16;
			boolean hover = hovered(mx, my, right - bw, y + 2, bw, 16);
			g.fill(right - bw, y + 2, right, y + 18, hover ? CARD_HOVER : CARD);
			g.text(v, right - bw + 8, y + 6, ACCENT, false);
			if (interactive) region(right - bw, y + 2, bw, 16, () -> {
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
