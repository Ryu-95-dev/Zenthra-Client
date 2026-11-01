package client.zenthra.module.impl;

import client.zenthra.compat.Gfx;
import client.zenthra.module.Category;
import client.zenthra.module.HudModule;
import client.zenthra.module.setting.BooleanSetting;
import client.zenthra.module.setting.ColorSetting;
import client.zenthra.module.setting.NumberSetting;
import client.zenthra.util.Draw;import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

/** Number of Totems of Undying in the inventory and the off hand. */
public class TotemCounterModule extends HudModule {
	// Created on first use: on 26.x items cannot be built while the game is still loading.
	private ItemStack icon;
	private final ColorSetting color = add(new ColorSetting("color", "Couleur", 0xFFFFFFFF));
	private final BooleanSetting background = add(new BooleanSetting("background", "Fond", true));

	public TotemCounterModule() {
		super("totem_counter", "Totem Counter", "Nombre de totems d'immortalité sur toi.", Category.PVP, false, 0.19, 0.30);
	}

	private int count() {
		if (mc.player == null) return 0;
		int n = mc.player.getOffhandItem().is(Items.TOTEM_OF_UNDYING) ? mc.player.getOffhandItem().getCount() : 0;
		for (int i = 0; i < 36; i++) {
			ItemStack s = mc.player.getInventory().getItem(i);
			if (s.is(Items.TOTEM_OF_UNDYING)) n += s.getCount();
		}
		return n;
	}

	@Override
	protected void renderElement(Gfx g, float partialTick, boolean editing) {
		int n = count();
		String text = String.valueOf(n);
		width = 22 + Draw.font().width(text) + 4;
		height = 18;
		if (background.get()) g.fill(0, 0, width, height, Draw.BG);
		if (icon == null) icon = new ItemStack(Items.TOTEM_OF_UNDYING);
		g.item(icon, 1, 1);
		g.text(text, 20, 5, n == 0 ? 0xFFF87171 : color.get(), true);
	}
}