package client.zenthra.compat;

import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.item.ItemStack;

/**
 * Drawing operations used by the shared code. Each Minecraft version family
 * implements it on top of its own GUI renderer (src/compat/<family>), so the
 * modules and menus are written once for every supported version.
 */
public interface Gfx {
	void fill(int x1, int y1, int x2, int y2, int argb);

	/** Draws text and returns the x coordinate just after it. */
	int text(String text, int x, int y, int argb, boolean shadow);

	void centeredText(String text, int centerX, int y, int argb);

	/** Text wrapped to `width` pixels. */
	void wrappedText(String text, int x, int y, int width, int argb);

	void outline(int x, int y, int width, int height, int argb);

	/** Item icon with its count and durability bar. */
	void item(ItemStack stack, int x, int y);

	/** 18×18 icon of a status effect. */
	void effectIcon(MobEffectInstance effect, int x, int y);

	void push();

	void translate(float x, float y);

	void scale(float factor);

	void pop();

	void scissor(int x1, int y1, int x2, int y2);

	void endScissor();
}
