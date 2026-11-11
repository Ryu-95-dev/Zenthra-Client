package client.zenthra.module.impl;

import client.zenthra.module.Category;
import client.zenthra.module.HudModule;
import client.zenthra.module.setting.BooleanSetting;
import client.zenthra.module.setting.ChoiceSetting;
import client.zenthra.util.Draw;
import java.util.ArrayList;
import java.util.List;
import client.zenthra.compat.Gfx;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

public class ArmorHudModule extends HudModule {
	private static final EquipmentSlot[] SLOTS = {EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET};

	private final ChoiceSetting layout = add(new ChoiceSetting("layout", "Disposition", List.of("vertical", "horizontal"), List.of("Verticale", "Horizontale"), "vertical"));
	private final ChoiceSetting durability = add(new ChoiceSetting("durability", "Durabilité", List.of("value", "percent", "none"), List.of("Valeur", "Pourcentage", "Masquée"), "value"));
	private final BooleanSetting mainHand = add(new BooleanSetting("main_hand", "Objet en main", true));

	// Reused every frame instead of allocating a new list.
	private final List<ItemStack> items = new ArrayList<>();
	/** Example equipment shown in the HUD editor (created once, when first needed). */
	private List<ItemStack> preview;
	/** Durability texts already built for 0..4095 (values) and 0..100 (percentages). */
	private static final String[] VALUES = new String[4096];
	private static final String[] PERCENTS = new String[101];

	public ArmorHudModule() {
		super("armor_hud", "Armor HUD", "Équipement porté et durabilité.", Category.HUD, true, 1.0, 0.62);
	}

	@Override
	protected void renderElement(Gfx g, float partialTick, boolean editing) {
		items.clear();
		if (mc.player != null) {
			for (EquipmentSlot slot : SLOTS) {
				ItemStack s = mc.player.getItemBySlot(slot);
				if (!s.isEmpty()) items.add(s);
			}
			if (mainHand.get() && !mc.player.getMainHandItem().isEmpty()) items.add(mc.player.getMainHandItem());
		}
		if (items.isEmpty() && editing) {
			if (preview == null) {
				preview = List.of(new ItemStack(Items.DIAMOND_HELMET), new ItemStack(Items.DIAMOND_CHESTPLATE), new ItemStack(Items.DIAMOND_LEGGINGS), new ItemStack(Items.DIAMOND_BOOTS));
			}
			items.addAll(preview);
		}
		boolean vertical = layout.is("vertical");
		int x = 0, y = 0, maxW = 16, maxH = 16;
		for (ItemStack stack : items) {
			g.item(stack, x, y);
			String text = durabilityText(stack);
			int itemW = 16;
			if (text != null) {
				int color = durabilityColor(stack);
				if (vertical) {
					g.text(text, x + 20, y + 4, color, true);
					itemW = 20 + Draw.font().width(text);
				} else {
					g.text(text, x + (16 - Draw.font().width(text)) / 2, y + 17, color, true);
					maxH = 26;
				}
			}
			if (vertical) {
				maxW = Math.max(maxW, itemW);
				y += 18;
			} else {
				x += Math.max(18, text != null ? Draw.font().width(text) + 4 : 18);
			}
		}
		width = vertical ? maxW : Math.max(16, x);
		height = vertical ? Math.max(16, y) : maxH;
	}

	private String durabilityText(ItemStack s) {
		if (!s.isDamageableItem() || durability.is("none")) return null;
		int left = s.getMaxDamage() - s.getDamageValue();
		if (durability.is("percent")) {
			int pct = Math.round(100f * left / s.getMaxDamage());
			if (pct < 0 || pct >= PERCENTS.length) return pct + "%";
			String t = PERCENTS[pct];
			if (t == null) PERCENTS[pct] = t = pct + "%";
			return t;
		}
		if (left < 0 || left >= VALUES.length) return String.valueOf(left);
		String t = VALUES[left];
		if (t == null) VALUES[left] = t = String.valueOf(left);
		return t;
	}

	private static int durabilityColor(ItemStack s) {
		float f = 1f - (float) s.getDamageValue() / s.getMaxDamage();
		return f > 0.5f ? 0xFFFFFFFF : f > 0.2f ? 0xFFFACC15 : 0xFFF87171;
	}
}
