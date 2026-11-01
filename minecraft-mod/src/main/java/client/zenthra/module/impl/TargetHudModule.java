package client.zenthra.module.impl;

import client.zenthra.compat.Gfx;
import client.zenthra.module.Category;
import client.zenthra.module.HudModule;
import client.zenthra.module.setting.BooleanSetting;
import client.zenthra.module.setting.NumberSetting;
import client.zenthra.util.Draw;
import java.util.Locale;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.EntityHitResult;

/**
 * Hearts of the player or creature under the crosshair. Shows only what the server
 * sends: some servers hide other players' health (it then looks full or empty).
 */
public class TargetHudModule extends HudModule {
	private static final String[] HEART = {".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."};

	private final BooleanSetting playersOnly = add(new BooleanSetting("players_only", "Joueurs seulement", true));
	private final NumberSetting keep = add(new NumberSetting("keep", "Reste affiché après avoir visé", 2, 0, 5, 1, " s"));
	private final BooleanSetting background = add(new BooleanSetting("background", "Fond", true));

	private LivingEntity target;
	private long lastSeen;

	public TargetHudModule() {
		super("target_hud", "Target HUD", "Cœurs restants du joueur que tu vises.", Category.PVP, false, 0.42, 0.58);
	}

	@Override
	public String hint() {
		return "Certains serveurs interdisent l'affichage de la vie des autres joueurs, et d'autres la cachent (elle paraît alors pleine ou vide).";
	}

	@Override
	public void tick() {
		if (mc.hitResult instanceof EntityHitResult hit && hit.getEntity() instanceof LivingEntity living
			&& (!playersOnly.get() || living instanceof Player) && living.isAlive()) {
			target = living;
			lastSeen = System.currentTimeMillis();
		} else if (target != null && (System.currentTimeMillis() - lastSeen > keep.getInt() * 1000L || !target.isAlive() || target.isRemoved())) {
			target = null;
		}
	}

	@Override
	protected void renderElement(Gfx g, float partialTick, boolean editing) {
		LivingEntity t = target;
		String name;
		float health, max, absorption;
		if (t != null) {
			name = t.getName().getString();
			health = t.getHealth();
			max = t.getMaxHealth();
			absorption = t.getAbsorptionAmount();
		} else if (editing) {
			name = "Joueur";
			health = 14;
			max = 20;
			absorption = 4;
		} else {
			width = 60;
			height = 26;
			return;
		}
		int heartsMax = Math.max(1, Math.min(10, (int) Math.ceil(max / 2)));
		int absHearts = Math.min(10, (int) Math.ceil(absorption / 2));
		String value = number(health) + " / " + number(max) + (absorption > 0 ? " +" + number(absorption) : "");
		int rowW = Math.max(heartsMax, absHearts) * 8;
		width = Math.max(Math.max(Draw.font().width(name), rowW + 4 + Draw.font().width(value)), 60) + 8;
		height = 26 + (absHearts > 0 ? 7 : 0);
		if (background.get()) g.fill(0, 0, width, height, Draw.BG);
		g.text(name, 4, 3, 0xFFFFFFFF, true);
		int y = 14;
		// Each heart = 2 health points; half hearts are drawn half filled.
		float scale = max > 20 ? 20f / max : 1f;
		for (int i = 0; i < heartsMax; i++) {
			float fill = Math.max(0, Math.min(2, health * scale - i * 2)) / 2f;
			heart(g, 4 + i * 8, y, 0xFF3A1616, 1f);
			if (fill > 0) heart(g, 4 + i * 8, y, 0xFFE53935, fill);
		}
		g.text(value, 4 + rowW + 4, y - 1, health / max < 0.3f ? 0xFFF87171 : 0xFFE6DCF7, true);
		for (int i = 0; i < absHearts; i++) {
			float fill = Math.max(0, Math.min(2, absorption - i * 2)) / 2f;
			heart(g, 4 + i * 8, y + 7, 0xFFF5C518, fill);
		}
	}

	private static String number(float v) {
		return v == Math.floor(v) ? String.valueOf((int) v) : String.format(Locale.ROOT, "%.1f", v);
	}

	/** 7×6 pixel heart, filled from the left by `fill` (0–1). */
	private static void heart(Gfx g, int x, int y, int color, float fill) {
		int cols = Math.max(1, Math.round(7 * fill));
		for (int r = 0; r < HEART.length; r++) {
			for (int c = 0; c < cols; c++) if (HEART[r].charAt(c) == '#') g.fill(x + c, y + r, x + c + 1, y + r + 1, color);
		}
	}
}
