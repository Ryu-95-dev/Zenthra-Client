package client.zenthra.gui;

import client.zenthra.ZenthraClient;
import client.zenthra.compat.Gfx;
import client.zenthra.compat.Platform;
import client.zenthra.compat.SkinInfo;
import client.zenthra.compat.ZScreen;
import client.zenthra.module.impl.MainMenuModule;
import client.zenthra.util.Draw;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import net.minecraft.network.chat.Component;

/**
 * Zenthra main menu, shown instead of Minecraft's title screen (MainMenuModule).
 * Every button triggers the matching button of a vanilla title screen built off
 * screen (Platform.titleAction), so world selection, the multiplayer warning,
 * options, demo mode and quitting behave exactly as in Minecraft.
 */
public class ZenthraTitleScreen extends ZScreen {
	private static final int BG_W = 480, BG_H = 270;
	private static final int LOGO_W = 640, LOGO_H = 220;
	private static final float MOON_X = 392, MOON_Y = 58;
	private static final int PANEL = 0x99140C22, PANEL_HOVER = 0xC02A1A45;
	private static final int BORDER = 0x55B48AE8, BORDER_HOVER = 0xFFD2B4FF;
	private static final int TEXT = 0xFFF1EAFB, MUTED = 0xFFA898BF;

	private enum Icon {
		PLAY("#........", "###......", "#####....", "#######..", "#########", "#######..", "#####....", "###......", "#........"),
		USERS(".##...##.", "####.####", "####.####", ".##...##.", ".........", "####.####", "#########", "#########", "#########"),
		GEAR("...###...", ".#.###.#.", "..#####..", "###...###", "###...###", "###...###", "..#####..", ".#.###.#.", "...###..."),
		EXIT("#####....", "#...#....", "#...#..#.", "#..######", "#...#..#.", "#...#....", "#...#....", "#####....", ".........");

		final String[] rows;

		Icon(String... rows) {
			this.rows = rows;
		}
	}

	private record Action(String label, Icon icon, Runnable run, boolean enabled, String disabledReason) {}

	private static final class Petal {
		float x, y, vx, vy, phase;
		int size, color;
	}

	private final Object background = Platform.texture("textures/gui/menu_background.png");
	private final Object logo = Platform.texture("textures/gui/logo.png");
	private final List<Action> actions = new ArrayList<>();
	private final float[] hover = new float[5];
	private final List<Petal> petals = new ArrayList<>();
	private final Random random = new Random();
	private long openedAt = -1;
	private long lastFrame;

	// Layout, computed in init() from the scaled screen size.
	private int bx, by, bw, bh, gap;
	private int lx, ly, lw, lh;
	private int cx, cy, cw, ch;
	private boolean card;
	private int fx, fy, fw, fh; // "Amis" button

	public ZenthraTitleScreen() {
		super(Component.literal("Zenthra Client"));
	}

	private static MainMenuModule settings() {
		return ZenthraClient.modules().get(MainMenuModule.class);
	}

	@Override
	protected void init() {
		boolean demo = Platform.isDemo();
		String solo = demo ? "menu.playdemo" : "menu.singleplayer";
		actions.clear();
		actions.add(new Action("Solo", Icon.PLAY, () -> Platform.titleAction(solo, true), Platform.titleAction(solo, false), null));
		actions.add(new Action("Multijoueur", Icon.USERS, () -> Platform.titleAction("menu.multiplayer", true),
			Platform.titleAction("menu.multiplayer", false), demo ? "Indisponible en mode démo" : "Indisponible"));
		actions.add(new Action("Options", Icon.GEAR, () -> Platform.titleAction("menu.options", true), true, null));
		actions.add(new Action("Quitter le jeu", Icon.EXIT, () -> Platform.titleAction("menu.quit", true), true, null));

		// Buttons in the centre, logo above, profile card on the left when there is room.
		bw = clamp((int) (width * 0.32f), 150, 270);
		bh = clamp((int) (height * 0.08f), 20, 32);
		gap = Math.max(4, bh / 4);
		int stack = 4 * bh + 3 * gap;
		lw = Math.min((int) (width * 0.46f), (int) (height * 0.30f * LOGO_W / LOGO_H));
		lh = lw * LOGO_H / LOGO_W;
		ly = Math.max(4, (int) (height * 0.03f));
		by = Math.max(ly + lh + 6, (int) (height * 0.43f));
		if (by + stack > height - 14) {
			by = height - 14 - stack;
			int room = by - 6 - ly;
			if (room < lh) {
				lh = Math.max(20, room);
				lw = lh * LOGO_W / LOGO_H;
			}
		}
		lx = (width - lw) / 2;
		bx = (width - bw) / 2;

		// Tall card from about the middle of the logo down, so the skin can be drawn large.
		cw = clamp((int) (width * 0.17f), 80, 140);
		cx = Math.max(8, (int) (width * 0.045f));
		cy = Math.max(8, ly + lh / 2);
		ch = Math.min(height - cy - 16, cw * 2 + 70);
		card = cx + cw + 10 <= bx && ch >= 110;

		if (card) {
			fw = cw - 16;
			fh = 18;
			fx = cx + 8;
			fy = cy + ch - fh - 8;
		} else {
			// Narrow window: the "Amis" button goes under the main buttons.
			fw = bw;
			fh = bh - 4;
			fx = bx;
			fy = Math.min(height - fh - 12, by + stack + gap);
		}
		if (openedAt < 0) openedAt = System.currentTimeMillis();
		if (petals.isEmpty()) for (int i = 0; i < Math.min(60, width * height / 1800); i++) petals.add(newPetal(true));
	}

	private Petal newPetal(boolean anywhere) {
		Petal p = new Petal();
		p.x = random.nextFloat() * (width + 40) - 20;
		p.y = anywhere ? random.nextFloat() * height : -6 - random.nextFloat() * 30;
		p.vx = 6 + random.nextFloat() * 10;
		p.vy = 10 + random.nextFloat() * 14;
		p.phase = random.nextFloat() * 6.28f;
		p.size = random.nextFloat() < 0.3f ? 2 : 1;
		int[] pinks = {0xE6F0B6EC, 0xD9D98AD8, 0xCCB765C0, 0xB3F7CDEF};
		p.color = pinks[random.nextInt(pinks.length)];
		return p;
	}

	private static int clamp(int v, int min, int max) {
		return Math.max(min, Math.min(max, v));
	}

	/** 0 → 1 over `duration` seconds after `delay`; always 1 when animations are off. */
	private float appear(float t, float delay, float duration) {
		if (!settings().animated()) return 1f;
		float a = Math.max(0f, Math.min(1f, (t - delay) / duration));
		return 1f - (1f - a) * (1f - a) * (1f - a);
	}

	@Override
	protected boolean zVanillaBackground() {
		return false;
	}

	@Override
	protected void zBackground(Gfx g, int mx, int my) {
		long now = System.currentTimeMillis();
		float dt = lastFrame == 0 ? 0 : Math.min(0.1f, (now - lastFrame) / 1000f);
		lastFrame = now;
		float t = (now - openedAt) / 1000f;
		boolean anim = settings().animated();

		// Background, scaled to cover the window (cropped at the edges, never stretched).
		float s = Math.max((float) width / BG_W, (float) height / BG_H);
		int dw = (int) Math.ceil(BG_W * s), dh = (int) Math.ceil(BG_H * s);
		int ox = (width - dw) / 2, oy = (height - dh) / 2;
		g.fill(0, 0, width, height, 0xFF07040D);
		g.texture(background, ox, oy, dw, dh, 0, 0, BG_W, BG_H, BG_W, BG_H);

		// Breathing moon glow.
		float pulse = anim ? 0.5f + 0.5f * (float) Math.sin(t * 1.3f) : 0.5f;
		int mcx = ox + Math.round(MOON_X * s), mcy = oy + Math.round(MOON_Y * s);
		disc(g, mcx, mcy, Math.round(40 * s), (int) (10 + 12 * pulse) << 24 | 0xB898F0);
		disc(g, mcx, mcy, Math.round(32 * s), (int) (8 + 10 * pulse) << 24 | 0xD8C4FF);

		// Falling sakura petals.
		if (settings().petals.get()) {
			for (int i = 0; i < petals.size(); i++) {
				Petal p = petals.get(i);
				if (anim) {
					p.phase += dt * 2.2f;
					p.x += (p.vx + (float) Math.sin(p.phase) * 8) * dt;
					p.y += p.vy * dt;
					if (p.y > height + 6 || p.x > width + 20) petals.set(i, p = newPetal(false));
				}
				int px = Math.round(p.x), py = Math.round(p.y);
				boolean flat = Math.sin(p.phase * 1.7f) > 0;
				g.fill(px, py, px + (flat ? 2 : 1) * p.size, py + (flat ? 1 : 2) * p.size, p.color);
			}
		}
		// Darken a little behind the interface for contrast.
		g.fill(0, 0, width, height, 0x30000000);
	}

	/** Filled circle made of horizontal lines. */
	private static void disc(Gfx g, int x, int y, int r, int argb) {
		for (int dy = -r; dy <= r; dy += 2) {
			int w = (int) Math.sqrt((double) r * r - (double) dy * dy);
			g.fill(x - w, y + dy, x + w, y + dy + 2, argb);
		}
	}

	@Override
	protected void zRender(Gfx g, int mx, int my, float partialTick) {
		float t = (System.currentTimeMillis() - openedAt) / 1000f;
		boolean anim = settings().animated();

		// Logo: fades/slides in, then floats gently.
		float la = appear(t, 0f, 0.6f);
		int bob = anim ? Math.round((float) Math.sin(t * 1.4f) * 1.5f) : 0;
		g.push();
		g.translate(0, (1 - la) * -12 + bob);
		g.texture(logo, lx, ly, lw, lh, 0, 0, LOGO_W, LOGO_H, LOGO_W, LOGO_H);
		g.pop();

		// Main buttons.
		for (int i = 0; i < actions.size(); i++) {
			Action a = actions.get(i);
			int y = by + i * (bh + gap);
			boolean over = a.enabled() && inside(mx, my, bx, y, bw, bh);
			hover[i] = approach(hover[i], over ? 1 : 0, anim);
			float in = appear(t, 0.15f + i * 0.07f, 0.45f);
			g.push();
			g.translate((1 - in) * -24 + hover[i] * 2, 0);
			drawButton(g, bx, y, bw, bh, a.label(), a.icon(), hover[i], a.enabled());
			g.pop();
			if (!a.enabled() && a.disabledReason() != null && inside(mx, my, bx, y, bw, bh)) g.text(a.disabledReason(), mx + 8, my - 10, MUTED, true);
		}

		// Profile card (or the lone "Amis" button on narrow windows).
		boolean friendsOver = inside(mx, my, fx, fy, fw, fh);
		hover[4] = approach(hover[4], friendsOver ? 1 : 0, anim);
		float ca = appear(t, 0.35f, 0.5f);
		g.push();
		g.translate((1 - ca) * -20, 0);
		if (card) drawCard(g, t, anim);
		drawSmallButton(g, fx, fy, fw, fh, "Amis", hover[4]);
		g.pop();

		g.text("Zenthra Client " + modVersion(), 4, height - 11, 0x99FFFFFF, true);
		String copyright = "© Mojang AB";
		g.text(copyright, width - Draw.font().width(copyright) - 4, height - 11, 0x66FFFFFF, true);
	}

	private static String modVersion() {
		return net.fabricmc.loader.api.FabricLoader.getInstance().getModContainer("zenthra")
			.map(m -> m.getMetadata().getVersion().getFriendlyString()).orElse("").replaceAll("\\+.*", "");
	}

	private static float approach(float v, float target, boolean anim) {
		return anim ? v + (target - v) * 0.25f : target;
	}

	private static boolean inside(int mx, int my, int x, int y, int w, int h) {
		return mx >= x && mx < x + w && my >= y && my < y + h;
	}

	private void drawButton(Gfx g, int x, int y, int w, int h, String label, Icon icon, float hv, boolean enabled) {
		// Outer glow on hover.
		if (hv > 0.02f) {
			roundOutline(g, x - 2, y - 2, w + 4, h + 4, (int) (0x38 * hv) << 24 | 0xA070F0);
			roundOutline(g, x - 1, y - 1, w + 2, h + 2, (int) (0x70 * hv) << 24 | 0xB890FF);
		}
		roundRect(g, x, y, w, h, Draw.lerpColor(PANEL, PANEL_HOVER, hv));
		g.fill(x + 2, y + 1, x + w - 2, y + 2, 0x22FFFFFF); // glass highlight
		g.fill(x + 2, y + 1, x + w / 2, y + h / 2, (int) (0x10 + 0x10 * hv) << 24 | 0xFFFFFF);
		roundOutline(g, x, y, w, h, Draw.lerpColor(BORDER, BORDER_HOVER, hv));

		int alpha = enabled ? 0xFF : 0x70;
		int u = Math.max(1, h / 14);
		int iconX = x + Math.max(10, w / 9), iconY = y + (h - 9 * u) / 2;
		drawIcon(g, icon, iconX, iconY, u, (alpha << 24) | (Draw.lerpColor(0xFFC9B0F5, 0xFFFFFFFF, hv) & 0xFFFFFF));
		float scale = h >= 26 ? 1.25f : 1f;
		g.push();
		g.translate(x + Math.max(36, w * 0.32f), y + (h - 8 * scale) / 2f + 1);
		g.scale(scale);
		g.text(label, 0, 0, (alpha << 24) | (TEXT & 0xFFFFFF), true);
		g.pop();
	}

	private void drawSmallButton(Gfx g, int x, int y, int w, int h, String label, float hv) {
		if (hv > 0.02f) roundOutline(g, x - 1, y - 1, w + 2, h + 2, (int) (0x60 * hv) << 24 | 0xB890FF);
		roundRect(g, x, y, w, h, Draw.lerpColor(0x66221838, 0xA0352058, hv));
		roundOutline(g, x, y, w, h, Draw.lerpColor(0x40B48AE8, 0xFFD2B4FF, hv));
		int u = Math.max(1, h / 16);
		drawIcon(g, Icon.USERS, x + 7, y + (h - 9 * u) / 2, u, 0xFFC9B0F5);
		g.text(label, x + 9 + 10 * u + 4, y + (h - 8) / 2 + 1, TEXT, true);
		g.text(">", x + w - 10, y + (h - 8) / 2 + 1, MUTED, false);
	}

	private void drawCard(Gfx g, float t, boolean anim) {
		roundOutline(g, cx - 1, cy - 1, cw + 2, ch + 2, 0x30A070F0);
		roundRect(g, cx, cy, cw, ch, 0x9910081C);
		g.fill(cx + 3, cy + 1, cx + cw - 3, cy + 2, 0x22FFFFFF);
		roundOutline(g, cx, cy, cw, ch, 0x66B48AE8);

		// Online status: the game was started with an account (not the demo).
		boolean online = !Platform.isDemo();
		int dot = online ? 0xFF3DDC84 : 0xFF8A8296;
		g.fill(cx + cw - 11, cy + 7, cx + cw - 6, cy + 12, dot);
		g.fill(cx + cw - 12, cy + 8, cx + cw - 5, cy + 11, dot);

		// Skin, front view, as large as the card allows.
		int nameH = 26;
		int areaTop = cy + 12, areaH = fy - 8 - nameH - areaTop;
		int s = Math.max(1, Math.min((cw - 24) / 16, areaH / 32));
		int sw = 16 * s, sh = 32 * s;
		int sx = cx + (cw - sw) / 2;
		int sy = areaTop + (areaH - sh) / 2 + (anim ? Math.round((float) Math.sin(t * 2f) * 1f) : 0);
		g.fill(sx + s * 2, sy + sh + 1, sx + sw - s * 2, sy + sh + 3, 0x50000000); // shadow
		drawSkin(g, Platform.playerSkin(), sx, sy, s);

		String name = Platform.playerName();
		int ny = fy - nameH - 2;
		g.push();
		float ns = Draw.font().width(name) * 1.25f <= cw - 10 ? 1.25f : 1f;
		g.translate(cx + cw / 2f - Draw.font().width(name) * ns / 2f, ny + 4);
		g.scale(ns);
		g.text(name, 0, 0, TEXT, true);
		g.pop();
		String status = online ? "En ligne" : "Mode démo";
		g.text(status, cx + (cw - Draw.font().width(status)) / 2, ny + 16, online ? 0xFF7FE0A8 : MUTED, false);
	}

	/** Flat front view of a 64×64 skin, with its second layer (hat, jacket, sleeves, trousers). */
	private static void drawSkin(Gfx g, SkinInfo skin, int x, int y, int s) {
		if (skin == null || skin.texture() == null) return;
		Object tex = skin.texture();
		int aw = skin.slim() ? 3 : 4;
		part(g, tex, x + 4 * s, y + 20 * s, 4, 12, 4, 20, s);                  // right leg
		part(g, tex, x + 8 * s, y + 20 * s, 4, 12, 20, 52, s);                 // left leg
		part(g, tex, x + 4 * s, y + 8 * s, 8, 12, 20, 20, s);                  // body
		part(g, tex, x + (4 - aw) * s, y + 8 * s, aw, 12, 44, 20, s);          // right arm
		part(g, tex, x + 12 * s, y + 8 * s, aw, 12, 36, 52, s);                // left arm
		part(g, tex, x + 4 * s, y, 8, 8, 8, 8, s);                             // head
		part(g, tex, x + 4 * s, y + 20 * s, 4, 12, 4, 36, s);                  // right trouser leg
		part(g, tex, x + 8 * s, y + 20 * s, 4, 12, 4, 52, s);                  // left trouser leg
		part(g, tex, x + 4 * s, y + 8 * s, 8, 12, 20, 36, s);                  // jacket
		part(g, tex, x + (4 - aw) * s, y + 8 * s, aw, 12, 44, 36, s);          // right sleeve
		part(g, tex, x + 12 * s, y + 8 * s, aw, 12, 52, 52, s);                // left sleeve
		part(g, tex, x + 4 * s, y, 8, 8, 40, 8, s);                            // hat
	}

	private static void part(Gfx g, Object tex, int x, int y, int w, int h, int u, int v, int s) {
		g.texture(tex, x, y, w * s, h * s, u, v, w, h, 64, 64);
	}

	private static void drawIcon(Gfx g, Icon icon, int x, int y, int u, int argb) {
		for (int r = 0; r < icon.rows.length; r++) {
			String row = icon.rows[r];
			for (int c = 0; c < row.length(); c++) if (row.charAt(c) == '#') g.fill(x + c * u, y + r * u, x + (c + 1) * u, y + (r + 1) * u, argb);
		}
	}

	/** Rectangle with 2-pixel rounded corners. */
	private static void roundRect(Gfx g, int x, int y, int w, int h, int argb) {
		g.fill(x + 2, y, x + w - 2, y + 1, argb);
		g.fill(x + 1, y + 1, x + w - 1, y + 2, argb);
		g.fill(x, y + 2, x + w, y + h - 2, argb);
		g.fill(x + 1, y + h - 2, x + w - 1, y + h - 1, argb);
		g.fill(x + 2, y + h - 1, x + w - 2, y + h, argb);
	}

	private static void roundOutline(Gfx g, int x, int y, int w, int h, int argb) {
		g.fill(x + 2, y, x + w - 2, y + 1, argb);
		g.fill(x + 2, y + h - 1, x + w - 2, y + h, argb);
		g.fill(x, y + 2, x + 1, y + h - 2, argb);
		g.fill(x + w - 1, y + 2, x + w, y + h - 2, argb);
		g.fill(x + 1, y + 1, x + 2, y + 2, argb);
		g.fill(x + w - 2, y + 1, x + w - 1, y + 2, argb);
		g.fill(x + 1, y + h - 2, x + 2, y + h - 1, argb);
		g.fill(x + w - 2, y + h - 2, x + w - 1, y + h - 1, argb);
	}

	@Override
	protected boolean zClick(double mx, double my, int button) {
		if (button != 0) return false;
		for (int i = 0; i < actions.size(); i++) {
			Action a = actions.get(i);
			if (a.enabled() && inside((int) mx, (int) my, bx, by + i * (bh + gap), bw, bh)) {
				playClick();
				a.run().run();
				return true;
			}
		}
		if (inside((int) mx, (int) my, fx, fy, fw, fh)) {
			playClick();
			openFriends();
			return true;
		}
		return false;
	}

	/** Opens the friends screen (also used by the self-test). */
	public void openFriends() {
		Platform.setScreen(new FriendsScreen(this));
	}

	/** Runs the "Solo" button (also used by the self-test). */
	public void playSolo() {
		actions.get(0).run().run();
	}

	@Override
	protected void zClose() {
		// The main menu stays open on Escape, like Minecraft's title screen.
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}
}
