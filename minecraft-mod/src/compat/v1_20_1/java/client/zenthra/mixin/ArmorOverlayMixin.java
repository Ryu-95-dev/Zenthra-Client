package client.zenthra.mixin;

import client.zenthra.Hooks;
import org.objectweb.asm.Opcodes;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.Redirect;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import net.minecraft.client.renderer.texture.OverlayTexture;import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.entity.layers.HumanoidArmorLayer;
import net.minecraft.world.entity.LivingEntity;

/** Hit Color on armor: the armor layer uses the entity's hurt overlay instead of "no overlay". */
@Mixin(HumanoidArmorLayer.class)
public class ArmorOverlayMixin {
	@Inject(method = "render(Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;ILnet/minecraft/world/entity/LivingEntity;FFFFFF)V", at = @At("HEAD"))
	private void zenthra$begin(PoseStack pose, MultiBufferSource buffers, int light, LivingEntity entity, float a, float b, float c, float d, float e, float f, CallbackInfo ci) {
		Hooks.beginArmor(entity.hurtTime > 0 || entity.deathTime > 0);
	}

	@Inject(method = "render(Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;ILnet/minecraft/world/entity/LivingEntity;FFFFFF)V", at = @At("RETURN"))
	private void zenthra$end(PoseStack pose, MultiBufferSource buffers, int light, LivingEntity entity, float a, float b, float c, float d, float e, float f, CallbackInfo ci) {
		Hooks.endArmor();
	}

	@Redirect(method = {"renderModel", "renderTrim", "renderGlint"}, at = @At(value = "FIELD", target = "Lnet/minecraft/client/renderer/texture/OverlayTexture;NO_OVERLAY:I", opcode = Opcodes.GETSTATIC), require = 1)
	private int zenthra$overlay() {
		return Hooks.armorOverlay(OverlayTexture.NO_OVERLAY);
	}

	@Redirect(method = "renderModel", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/renderer/RenderType;armorCutoutNoCull(Lnet/minecraft/resources/ResourceLocation;)Lnet/minecraft/client/renderer/RenderType;"))
	private net.minecraft.client.renderer.RenderType zenthra$type(net.minecraft.resources.ResourceLocation texture) {
		// The armor shader ignores the hurt tint: while hurt, draw armor with the entity shader.
		return Hooks.tintArmor() ? net.minecraft.client.renderer.RenderType.entityCutoutNoCull(texture) : net.minecraft.client.renderer.RenderType.armorCutoutNoCull(texture);
	}
}
