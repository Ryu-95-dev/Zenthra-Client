package client.zenthra.gui;

import client.zenthra.compat.Platform;
import client.zenthra.ZenthraClient;
import client.zenthra.compat.Gfx;
import client.zenthra.compat.ZScreen;
import client.zenthra.module.HudModule;
import client.zenthra.module.setting.NumberSetting;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/** Drag HUD elements to move them, scroll to resize, right-click to reset. */
public class HudEditorScreen extends ZScreen {
	private final Screen parent;
	private HudModule dragging;
	private double offsetX, offsetY;

	public HudEditorScreen(Screen parent) {
		super(Component.literal("Éditeur de HUD"));
		this.parent = parent;
	}

	@Override
	protected void init() {
		button("Terminé", width / 2 - 50, height / 2 - 10, 100, 20, b -> onClose());
	}

	@Override
	protected boolean zVanillaBackground() {
		return false;
	}

	@Override
	protected void zBackground(Gfx g, int mx, int my) {
		g.fill(0, 0, width, height, 0x50000000);
		for (int x = 0; x < width; x += 20) g.fill(x, 0, x + 1, height, 0x0CFFFFFF);
		for (int y = 0; y < height; y += 20) g.fill(0, y, width, y + 1, 0x0CFFFFFF);
	}

	@Override
	protected void zRender(Gfx g, int mx, int my, float pt) {
		for (HudModule m : ZenthraClient.modules().hud()) {
			if (!m.isEnabled()) continue;
			m.render(g, pt, true);
			int x = m.screenX(width, m.scaledWidthFactor()), y = m.screenY(height, m.scaledWidthFactor());
			boolean hover = contains(m, mx, my);
			g.outline(x - 1, y - 1, m.scaledWidth() + 2, m.scaledHeight() + 2, hover || m == dragging ? BaseScreen.ACCENT : 0x60FFFFFF);
		}
		g.centeredText("Glisser : déplacer · Molette : taille · Clic droit : position par défaut", width / 2, height / 2 + 16, 0xFFB9B5C9);
	}

	private boolean contains(HudModule m, double mx, double my) {
		int x = m.screenX(width, m.scaledWidthFactor()), y = m.screenY(height, m.scaledWidthFactor());
		return mx >= x && mx < x + m.scaledWidth() && my >= y && my < y + m.scaledHeight();
	}

	private HudModule at(double mx, double my) {
		var list = ZenthraClient.modules().hud();
		for (int i = list.size() - 1; i >= 0; i--) {
			HudModule m = list.get(i);
			if (m.isEnabled() && contains(m, mx, my)) return m;
		}
		return null;
	}

	@Override
	protected boolean zClick(double mx, double my, int button) {
		HudModule m = at(mx, my);
		if (m == null) return false;
		if (button == 1) {
			m.resetPosition();
			ZenthraClient.config().markDirty();
			return true;
		}
		dragging = m;
		offsetX = mx - m.screenX(width, m.scaledWidthFactor());
		offsetY = my - m.screenY(height, m.scaledWidthFactor());
		return true;
	}

	@Override
	protected boolean zDrag(double mx, double my, int button) {
		if (dragging == null) return false;
		dragging.setPosition((mx - offsetX) / width, (my - offsetY) / height);
		return true;
	}

	@Override
	protected boolean zRelease(double mx, double my, int button) {
		if (dragging == null) return false;
		dragging = null;
		ZenthraClient.config().markDirty();
		return true;
	}

	@Override
	protected boolean zScroll(double mx, double my, double amount) {
		HudModule m = at(mx, my);
		if (m == null) return false;
		NumberSetting scale = m.scaleSetting();
		scale.set(scale.get() + (amount > 0 ? 0.05 : -0.05));
		ZenthraClient.config().markDirty();
		return true;
	}

	@Override
	protected void zClose() {
		Platform.setScreen(parent);
	}
}