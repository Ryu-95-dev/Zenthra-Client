package client.zenthra.compat;

import java.util.function.Consumer;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvents;

/**
 * Base of every Zenthra screen for 1.21.5. It adapts Minecraft's screen
 * API to version-independent callbacks (z*), so the menus themselves live in
 * the shared code.
 */
public abstract class ZScreen extends Screen {
	protected ZScreen(Component title) {
		super(title);
	}

	/** Drawn above the vanilla (blurred) background and below the widgets. */
	protected void zBackground(Gfx g, int mx, int my) {}

	/** Drawn above the widgets. */
	protected abstract void zRender(Gfx g, int mx, int my, float partialTick);

	protected boolean zClick(double mx, double my, int button) { return false; }
	protected boolean zRelease(double mx, double my, int button) { return false; }
	protected boolean zDrag(double mx, double my, int button) { return false; }
	protected boolean zScroll(double mx, double my, double amount) { return false; }
	protected boolean zKey(int key, int scan, int modifiers) { return false; }
	/** False to skip Minecraft's blurred menu background (HUD editor). */
	protected boolean zVanillaBackground() { return true; }
	/** Called when the screen closes (Escape or code). */
	protected void zClose() {
		minecraft.setScreen(null);
	}

	protected Button button(String label, int x, int y, int w, int h, Consumer<Button> onPress) {
		return addRenderableWidget(Button.builder(Component.literal(label), onPress::accept).bounds(x, y, w, h).build());
	}

	protected EditBox editBox(int x, int y, int w, int h, String hint) {
		EditBox box = new EditBox(font, x, y, w, h, Component.literal(hint));
		box.setHint(Component.literal(hint));
		return addRenderableWidget(box);
	}

	protected void playClick() {
		minecraft.getSoundManager().play(SimpleSoundInstance.forUI(SoundEvents.UI_BUTTON_CLICK, 1.0F));
	}

	@Override
	public void renderBackground(GuiGraphics g, int mx, int my, float pt) {
		if (zVanillaBackground()) super.renderBackground(g, mx, my, pt);
		zBackground(new GuiGfx(g), mx, my);
	}

	@Override
	public void render(GuiGraphics g, int mx, int my, float pt) {
		super.render(g, mx, my, pt);
		zRender(new GuiGfx(g), mx, my, pt);
	}

	@Override
	public boolean mouseClicked(double mx, double my, int button) {
		return super.mouseClicked(mx, my, button) || zClick(mx, my, button);
	}

	@Override
	public boolean mouseReleased(double mx, double my, int button) {
		return zRelease(mx, my, button) || super.mouseReleased(mx, my, button);
	}

	@Override
	public boolean mouseDragged(double mx, double my, int button, double dx, double dy) {
		return zDrag(mx, my, button) || super.mouseDragged(mx, my, button, dx, dy);
	}

	@Override
	public boolean mouseScrolled(double mx, double my, double sx, double sy) {
		return zScroll(mx, my, sy) || super.mouseScrolled(mx, my, sx, sy);
	}

	@Override
	public boolean keyPressed(int key, int scan, int modifiers) {
		return zKey(key, scan, modifiers) || super.keyPressed(key, scan, modifiers);
	}

	@Override
	public void onClose() {
		zClose();
	}

	@Override
	public boolean isPauseScreen() {
		return true;
	}
}
