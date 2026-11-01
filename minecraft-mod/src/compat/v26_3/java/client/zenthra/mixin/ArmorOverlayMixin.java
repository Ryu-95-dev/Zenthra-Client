package client.zenthra.mixin;

import client.zenthra.Hooks;
import org.objectweb.asm.Opcodes;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.Redirect;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import net.minecraft.client.renderer.texture.OverlayTexture;import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.layers.EquipmentLayerRenderer;
import net.minecraft.client.renderer.entity.layers.HumanoidArmorLayer;
import net.minecraft.client.renderer.entity.state.HumanoidRenderState;

/** Hit Color on armor: the armor layer uses the entity's hurt overlay instead of "no overlay". */
public final class ArmorOverlayMixin {
	private ArmorOverlayMixin() {}

	@Mixin(HumanoidArmorLayer.class)
	public static class Layer {
		@Inject(method = "submit(Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/SubmitNodeCollector;ILnet/minecraft/client/renderer/entity/state/HumanoidRenderState;FF)V", at = @At("HEAD"))
		private void zenthra$begin(PoseStack pose, SubmitNodeCollector buffers, int light, HumanoidRenderState state, float a, float b, CallbackInfo ci) {
			Hooks.beginArmor(state.hasRedOverlay);
		}

		@Inject(method = "submit(Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/SubmitNodeCollector;ILnet/minecraft/client/renderer/entity/state/HumanoidRenderState;FF)V", at = @At("RETURN"))
		private void zenthra$end(PoseStack pose, SubmitNodeCollector buffers, int light, HumanoidRenderState state, float a, float b, CallbackInfo ci) {
			Hooks.endArmor();
		}
	}

	@Mixin(EquipmentLayerRenderer.class)
	public static class Equipment {
		@Redirect(method = "renderLayers(Lnet/minecraft/client/resources/model/EquipmentClientInfo$LayerType;Lnet/minecraft/resources/ResourceKey;Lnet/minecraft/client/model/Model;Ljava/lang/Object;Lnet/minecraft/world/item/ItemStack;Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/SubmitNodeCollector;ILnet/minecraft/resources/Identifier;II)V", at = @At(value = "FIELD", target = "Lnet/minecraft/client/renderer/texture/OverlayTexture;NO_OVERLAY:I", opcode = Opcodes.GETSTATIC), require = 1)
		private int zenthra$overlay() {
			return Hooks.armorOverlay(OverlayTexture.NO_OVERLAY);
		}
		@Redirect(method = "renderLayers(Lnet/minecraft/client/resources/model/EquipmentClientInfo$LayerType;Lnet/minecraft/resources/ResourceKey;Lnet/minecraft/client/model/Model;Ljava/lang/Object;Lnet/minecraft/world/item/ItemStack;Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/SubmitNodeCollector;ILnet/minecraft/resources/Identifier;II)V", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/renderer/rendertype/RenderTypes;armorCutoutNoCull(Lnet/minecraft/resources/Identifier;)Lnet/minecraft/client/renderer/rendertype/RenderType;"))
		private net.minecraft.client.renderer.rendertype.RenderType zenthra$type(net.minecraft.resources.Identifier texture) {
			// The armor shader ignores the hurt tint: while hurt, draw armor with the entity shader.
			return Hooks.tintArmor() ? net.minecraft.client.renderer.rendertype.RenderTypes.entityCutout(texture) : net.minecraft.client.renderer.rendertype.RenderTypes.armorCutoutNoCull(texture);
		}
		@Redirect(method = "renderLayers(Lnet/minecraft/client/resources/model/EquipmentClientInfo$LayerType;Lnet/minecraft/resources/ResourceKey;Lnet/minecraft/client/model/Model;Ljava/lang/Object;Lnet/minecraft/world/item/ItemStack;Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/SubmitNodeCollector;ILnet/minecraft/resources/Identifier;II)V", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/renderer/rendertype/RenderTypes;armorCutoutNoCullGlint(Lnet/minecraft/resources/Identifier;)Lnet/minecraft/client/renderer/rendertype/RenderType;"))
		private net.minecraft.client.renderer.rendertype.RenderType zenthra$glintType(net.minecraft.resources.Identifier texture) {
			return Hooks.tintArmor() ? net.minecraft.client.renderer.rendertype.RenderTypes.entityCutout(texture) : net.minecraft.client.renderer.rendertype.RenderTypes.armorCutoutNoCullGlint(texture);
		}
	}
}