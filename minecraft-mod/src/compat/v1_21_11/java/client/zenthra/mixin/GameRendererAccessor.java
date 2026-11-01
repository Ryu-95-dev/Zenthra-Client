package client.zenthra.mixin;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Invoker;
import net.minecraft.client.renderer.GameRenderer;
import net.minecraft.resources.Identifier;

/** Loads a post effect (Zenthra motion blur) through the game's own post-effect slot. */
@Mixin(GameRenderer.class)
public interface GameRendererAccessor {
	@Invoker("setPostEffect")
	void zenthra$setPostEffect(Identifier id);
}
