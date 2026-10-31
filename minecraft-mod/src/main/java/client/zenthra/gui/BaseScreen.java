package client.zenthra.gui;

import client.zenthra.compat.Platform;
import client.zenthra.compat.Gfx;
import client.zenthra.compat.ZScreen;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/**
 * Shared look of Zenthra screens: a dark centred panel, simple drawn
 * controls and click regions rebuilt every frame.
 */
public abstract class BaseScreen extends ZScreen {
	public static final int PANEL = 0xF0121217;
	public static final int SIDEBAR = 0xF00D0D11;
	public static final int CARD = 0xFF1A1A21;
	public static final int CARD_HOVER = 0xFF22222B;
	public static final int BORDER = 0x22FFFFFF;
	public static final int TEXT = 0xFFECEBF2;
	public static final int MUTED = 0xFF9B98A8;
	public static final int ACCENT = 0xFF8B5CF6;
	public static final int ACCENT_SOFT = 0x408B5CF6;

	protected final Screen parent;
	protected int px, py, pw, ph;
	private final List<Region> regions = new ArrayList<>();

	private record Region(int x, int y, int w, int h, Runnable action) {
		boolean contains(double mx, double my) {
			return mx >= x && mx < x + w && my >= y && my < y + h;
		}
	}

	protected BaseScreen(Component title, Screen parent) {
		super(title);
		this.parent = parent;
	}

	/** Computes the panel rectangle; call at the start of init(). */
	protected void layoutPanel(int maxW, int maxH) {
		pw = Math.min(width - 24, maxW);
		ph = Math.min(height - 24, maxH);
		px = (width - pw) / 2;
		py = (height - ph) / 2;
	}

	@Override
	protected void zBackground(Gfx g, int mouseX, int mouseY) {
		g.fill(px, py, px + pw, py + ph, PANEL);
		g.outline(px, py, pw, ph, BORDER);
	}

	@Override
	protected final void zRender(Gfx g, int mouseX, int mouseY, float partialTick) {
		regions.clear();
		renderContent(g, mouseX, mouseY, partialTick);
	}

	protected abstract void renderContent(Gfx g, int mouseX, int mouseY, float partialTick);

	protected void region(int x, int y, int w, int h, Runnable action) {
		regions.add(new Region(x, y, w, h, action));
	}

	protected static boolean hovered(int mx, int my, int x, int y, int w, int h) {
		return mx >= x && mx < x + w && my >= y && my < y + h;
	}

	@Override
	protected boolean zClick(double mx, double my, int button) {
		if (button != 0) return false;
		for (int i = regions.size() - 1; i >= 0; i--) {
			Region r = regions.get(i);
			if (r.contains(mx, my)) {
				playClick();
				r.action().run();
				return true;
			}
		}
		return false;
	}

	protected void drawToggle(Gfx g, int x, int y, boolean on) {
		g.fill(x, y, x + 20, y + 10, on ? ACCENT : 0xFF3A3A44);
		int kx = on ? x + 11 : x + 1;
		g.fill(kx, y + 1, kx + 8, y + 9, 0xFFFFFFFF);
	}

	@Override
	protected void zClose() {
		Platform.setScreen(parent);
	}
}