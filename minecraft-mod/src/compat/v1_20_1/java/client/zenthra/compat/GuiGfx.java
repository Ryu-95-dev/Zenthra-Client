package client.zenthra.compat;

import net.minecraft.client.Minecraft;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.network.chat.Component;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.item.ItemStack;

/** Gfx on top of 1.20–1.20.1's GuiGraphics (PoseStack-based). */
final class GuiGfx implements Gfx {
	final GuiGraphics g;

	GuiGfx(GuiGraphics g) {
		this.g = g;
	}

	private static net.minecraft.client.gui.Font font() {
		return Minecraft.getInstance().font;
	}

	@Override public void fill(int x1, int y1, int x2, int y2, int argb) { g.fill(x1, y1, x2, y2, argb); }
	@Override public int text(String text, int x, int y, int argb, boolean shadow) { return g.drawString(font(), text, x, y, argb, shadow); }
	@Override public void centeredText(String text, int cx, int y, int argb) { g.drawCenteredString(font(), text, cx, y, argb); }
	@Override public void wrappedText(String text, int x, int y, int width, int argb) { g.drawWordWrap(font(), Component.literal(text), x, y, width, argb); }
	@Override public void outline(int x, int y, int w, int h, int argb) { g.renderOutline(x, y, w, h, argb); }

	@Override
	public void item(ItemStack stack, int x, int y) {
		g.renderItem(stack, x, y);
		g.renderItemDecorations(font(), stack, x, y);
	}

	@Override
	public void effectIcon(MobEffectInstance effect, int x, int y) {
		g.blit(x, y, 0, 18, 18, Minecraft.getInstance().getMobEffectTextures().get(effect.getEffect()));
	}

	@Override
	public void texture(Object id, int x, int y, int w, int h, float u, float v, int uw, int vh, int texW, int texH) {
		g.blit((ResourceLocation) id, x, y, w, h, u, v, uw, vh, texW, texH);
	}

	@Override public void push() { g.pose().pushPose(); }
	@Override public void translate(float x, float y) { g.pose().translate(x, y, 0); }
	@Override public void scale(float f) { g.pose().scale(f, f, 1); }
	@Override public void pop() { g.pose().popPose(); }
	@Override public void scissor(int x1, int y1, int x2, int y2) { g.enableScissor(x1, y1, x2, y2); }
	@Override public void endScissor() { g.disableScissor(); }
}
