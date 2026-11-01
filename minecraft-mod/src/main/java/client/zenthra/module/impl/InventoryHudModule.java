package client.zenthra.module.impl;

import client.zenthra.compat.Gfx;
import client.zenthra.module.Category;
import client.zenthra.module.HudModule;
import client.zenthra.module.setting.BooleanSetting;
import client.zenthra.module.setting.ColorSetting;
import client.zenthra.module.setting.NumberSetting;
import client.zenthra.util.Draw;import net.minecraft.world.item.ItemStack;

/** The 27 slots of the main inventory, on screen. */
public class InventoryHudModule extends HudModule {
	private final BooleanSetting background = add(new BooleanSetting("background", "Fond", true));

	public InventoryHudModule() {
		super("inventory_hud", "Inventory HUD", "Affiche le contenu de ton inventaire à l'écran.", Category.HUD, false, 0.31, 0.55);
	}

	@Override
	protected void renderElement(Gfx g, float partialTick, boolean editing) {
		width = 9 * 18 + 4;
		height = 3 * 18 + 4;
		if (background.get()) g.fill(0, 0, width, height, Draw.BG);
		if (mc.player == null) return;
		for (int i = 0; i < 27; i++) {
			ItemStack stack = mc.player.getInventory().getItem(9 + i);
			int x = 2 + (i % 9) * 18 + 1, y = 2 + (i / 9) * 18 + 1;
			g.fill(x - 1, y - 1, x + 17, y + 17, 0x30FFFFFF);
			if (!stack.isEmpty()) g.item(stack, x, y);
		}
	}
}