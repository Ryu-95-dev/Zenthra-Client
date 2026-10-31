package client.zenthra.compat;

/** Draws Zenthra's HUD once per frame (registered by Platform.registerHud). */
@FunctionalInterface
public interface HudRenderer {
	void render(Gfx g, float partialTick);
}
