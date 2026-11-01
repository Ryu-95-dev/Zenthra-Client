package client.zenthra.module.impl;

import client.zenthra.compat.Gfx;
import client.zenthra.module.Category;
import client.zenthra.module.HudModule;
import client.zenthra.module.setting.BooleanSetting;
import client.zenthra.module.setting.ColorSetting;
import client.zenthra.module.setting.NumberSetting;
import client.zenthra.util.Draw;import java.util.ArrayList;
import java.util.List;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;

/** Warns when a worn or held item is about to break. */
public class DurabilityAlertModule extends HudModule {
	private static final EquipmentSlot[] SLOTS = {EquipmentSlot.MAINHAND, EquipmentSlot.OFFHAND, EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET};
	private static final String[] NAMES = {"Main", "Seconde main", "Casque", "Plastron", "Jambières", "Bottes"};
	private final NumberSetting threshold = add(new NumberSetting("threshold", "Seuil d'alerte", 15, 5, 50, 1, " %"));

	public DurabilityAlertModule() {
		super("durability_alert", "Durability Alert", "Alerte quand un objet porté va bientôt casser.", Category.PVP, false, 0.40, 0.30);
	}

	@Override
	protected void renderElement(Gfx g, float partialTick, boolean editing) {
		List<String> lines = new ArrayList<>();
		if (mc.player != null) {
			for (int i = 0; i < SLOTS.length; i++) {
				ItemStack s = mc.player.getItemBySlot(SLOTS[i]);
				if (s.isEmpty() || !s.isDamageableItem()) continue;
				int pct = Math.round(100f * (s.getMaxDamage() - s.getDamageValue()) / s.getMaxDamage());
				if (pct <= threshold.getInt()) lines.add(NAMES[i] + " : " + pct + " %");
			}
		}
		if (lines.isEmpty() && editing) lines.add("Plastron : 12 %");
		boolean blink = (System.currentTimeMillis() / 500) % 2 == 0;
		int w = 0;
		for (String l : lines) w = Math.max(w, Draw.font().width(l));
		width = Math.max(40, w + 8);
		height = Math.max(12, lines.size() * 11 + 3);
		if (lines.isEmpty()) return;
		g.fill(0, 0, width, height, blink ? 0xA07F1D1D : 0xA0450F0F);
		for (int i = 0; i < lines.size(); i++) g.text(lines.get(i), 4, 3 + i * 11, 0xFFFCA5A5, true);
	}
}