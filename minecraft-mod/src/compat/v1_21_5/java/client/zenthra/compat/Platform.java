package client.zenthra.compat;

import client.zenthra.mixin.OverlayTextureAccessor;
import com.mojang.blaze3d.platform.GLX;
import com.mojang.blaze3d.systems.GpuDevice;
import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.platform.InputConstants;
import com.mojang.blaze3d.platform.NativeImage;
import java.io.File;
import java.util.List;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.function.Supplier;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderEvents;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.fabricmc.fabric.api.client.screen.v1.Screens;
import net.minecraft.SharedConstants;
import net.minecraft.client.CloudStatus;
import net.minecraft.client.GraphicsStatus;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.client.Options;
import net.minecraft.server.level.ParticleStatus;
import net.minecraft.client.Screenshot;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.PauseScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.gui.screens.options.VideoSettingsScreen;
import net.minecraft.client.gui.screens.options.controls.KeyBindsScreen;
import net.minecraft.client.gui.screens.packs.PackSelectionScreen;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.contents.TranslatableContents;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.scores.DisplaySlot;
import net.minecraft.world.scores.Objective;
import net.minecraft.world.scores.ScoreHolder;
import net.minecraft.world.scores.Scoreboard;
import net.minecraft.world.scores.criteria.ObjectiveCriteria;

/** Everything the shared code needs from Minecraft 1.21.5 that changes between versions. */
public final class Platform {
	private Platform() {}

	private static Minecraft mc() {
		return Minecraft.getInstance();
	}

	// ---- Input ----

	public static KeyMapping key(String name, String defaultKey) {
		int glfwKey = InputConstants.getKey(defaultKey).getValue();
		return KeyBindingHelper.registerKeyBinding(new KeyMapping(name, InputConstants.Type.KEYSYM, glfwKey, "key.categories.zenthra"));
	}

	public static boolean keyMatches(KeyMapping key, int keyCode, int scanCode) {
		return key.matches(keyCode, scanCode);
	}

	public static float forwardImpulse(LocalPlayer player) {
		return player.input.getMoveVector().y;
	}

	// ---- Game information ----

	public static boolean hudHidden() {
		return mc().options.hideGui;
	}

	public static boolean loadingOverlay() {
		return mc().getOverlay() != null;
	}

	public static boolean debugScreenShown() {
		return mc().getDebugOverlay().showDebugScreen();
	}

	public static String mcVersion() {
		return SharedConstants.getCurrentVersion().getName();
	}

	public static String gpu() {
		GpuDevice device = RenderSystem.tryGetDevice();
		return device == null ? "inconnu" : device.getRenderer();
	}

	public static String gpuVendor() {
		GpuDevice device = RenderSystem.tryGetDevice();
		return device == null ? "inconnu" : device.getVendor();
	}

	public static String cpu() {
		return GLX._getCpuInfo();
	}

	public static String effectName(MobEffectInstance effect) {
		return effect.getEffect().value().getDisplayName().getString();
	}

	public static String dimensionId(net.minecraft.world.level.Level level) {
		return level.dimension().location().toString();
	}

	/** Time of day of the level in ticks (24000 per day). */
	public static long dayTime(net.minecraft.world.level.Level level) {
		return level.getDayTime();
	}

	public static String singleplayerWorldName() {
		var server = mc().getSingleplayerServer();
		return server == null ? null : server.getWorldData().getLevelName();
	}

	// ---- Rendering hooks ----

	public static void registerHud(HudRenderer renderer) {
		HudRenderCallback.EVENT.register((graphics, delta) -> renderer.render(new GuiGfx(graphics), delta.getGameTimeDeltaPartialTick(false)));
	}

	public static void registerWorldFrame(WorldFrameListener listener) {
		WorldRenderEvents.END.register(ctx -> listener.onWorldFrame(ctx.positionMatrix(), ctx.projectionMatrix(), ctx.camera().getPosition()));
	}

	/** Recolours the red "hurt" half of the entity overlay texture. */
	public static void setHurtOverlayColor(int argb) {
		if (mc().gameRenderer == null) return;
		mc().execute(() -> {
			var texture = ((OverlayTextureAccessor) mc().gameRenderer.overlayTexture()).zenthra$getTexture();
			NativeImage image = texture.getPixels();
			if (image == null) return;
			for (int y = 0; y < 8; y++) for (int x = 0; x < 16; x++) image.setPixel(x, y, argb);
			texture.upload();
		});
	}

	// ---- Screens ----

	public static Screen screen() {
		return mc().screen;
	}

	public static void setScreen(Screen screen) {
		mc().setScreen(screen);
	}


	public static Screen keyBindsScreen(Screen parent) {
		return new KeyBindsScreen(parent, mc().options);
	}

	public static Screen videoSettingsScreen(Screen parent) {
		return new VideoSettingsScreen(parent, mc(), mc().options);
	}

	public static Screen resourcePackScreen(Screen back) {
		Options options = mc().options;
		return new PackSelectionScreen(mc().getResourcePackRepository(), repo -> {
			options.updateResourcePacks(repo);
			mc().setScreen(back);
		}, mc().getResourcePackDirectory(), Component.translatable("resourcePack.title"));
	}

	/** Adds a button under the vanilla buttons of the pause menu. */
	public static void installPauseButton(Supplier<Component> label, Function<Screen, Screen> open) {
		ScreenEvents.AFTER_INIT.register((client, screen, w, h) -> {
			if (!(screen instanceof PauseScreen pause) || !pause.showsPauseMenu()) return;
			int bottom = 0;
			for (AbstractWidget widget : Screens.getButtons(screen)) bottom = Math.max(bottom, widget.getY() + widget.getHeight());
			Screens.getButtons(screen).add(Button.builder(label.get(), b -> client.setScreen(open.apply(screen)))
				.bounds(w / 2 - 102, Math.min(bottom + 8, h - 28), 204, 20).build());
		});
	}

	/** Restricts a text field to an optional minus sign followed by digits. */
	public static void integerOnly(net.minecraft.client.gui.components.EditBox box) {
		box.setFilter(s -> s.matches("-?\\d*"));
	}

	public static List<Button> buttonsOf(Screen screen) {
		return Screens.getButtons(screen).stream().filter(w -> w instanceof Button).map(w -> (Button) w).toList();
	}

	public static void press(Button b) {
		b.onPress();
	}

	public static boolean hasTranslationKey(Component c, String key) {
		return c.getContents() instanceof TranslatableContents t && t.getKey().equals(key);
	}

	public static boolean isTitleScreen(Screen s) {
		return s instanceof TitleScreen;
	}

	public static Screen titleScreen() {
		return new TitleScreen();
	}

	public static void screenshot(String fileName, Consumer<String> done) {
		Screenshot.grab(new File(mc().gameDirectory.getPath()), fileName, mc().getMainRenderTarget(), c -> done.accept(fileName));
	}

	// ---- Performance view (vanilla video options) ----

	private static int next(int[] steps, int current) {
		for (int s : steps) if (s > current) return s;
		return steps[0];
	}

	public static List<PerfOption> perfOptions() {
		Options o = mc().options;
		return List.of(
			new PerfOption("Distance de rendu", () -> o.renderDistance().get() + " chunks", () -> o.renderDistance().set(next(new int[] {4, 6, 8, 10, 12, 16, 20, 24, 32}, o.renderDistance().get()))),
			new PerfOption("Graphismes", () -> o.graphicsMode().get() == GraphicsStatus.FAST ? "Rapides" : "Détaillés",
				() -> o.graphicsMode().set(o.graphicsMode().get() == GraphicsStatus.FAST ? GraphicsStatus.FANCY : GraphicsStatus.FAST)),
			new PerfOption("Particules", () -> switch (o.particles().get()) {
				case ALL -> "Toutes";
				case DECREASED -> "Réduites";
				case MINIMAL -> "Minimales";
			}, () -> o.particles().set(switch (o.particles().get()) {
				case ALL -> ParticleStatus.DECREASED;
				case DECREASED -> ParticleStatus.MINIMAL;
				case MINIMAL -> ParticleStatus.ALL;
			})),
			new PerfOption("Nuages", () -> switch (o.cloudStatus().get()) {
				case OFF -> "Désactivés";
				case FAST -> "Rapides";
				case FANCY -> "Détaillés";
			}, () -> o.cloudStatus().set(switch (o.cloudStatus().get()) {
				case OFF -> CloudStatus.FAST;
				case FAST -> CloudStatus.FANCY;
				case FANCY -> CloudStatus.OFF;
			})),
			new PerfOption("Ombres des entités", () -> o.entityShadows().get() ? "Activées" : "Désactivées", () -> o.entityShadows().set(!o.entityShadows().get())),
			new PerfOption("FPS maximum", () -> o.framerateLimit().get() >= 260 ? "Illimité" : String.valueOf(o.framerateLimit().get()),
				() -> o.framerateLimit().set(next(new int[] {60, 120, 144, 165, 240, 260}, o.framerateLimit().get()))));
	}

	// ---- Self-test helpers (integrated server) ----

	public static void testGiveGear(ServerPlayer sp) {
		sp.setItemSlot(EquipmentSlot.HEAD, new ItemStack(Items.DIAMOND_HELMET));
		ItemStack chest = new ItemStack(Items.IRON_CHESTPLATE);
		chest.setDamageValue(chest.getMaxDamage() * 3 / 4);
		sp.setItemSlot(EquipmentSlot.CHEST, chest);
		sp.setItemSlot(EquipmentSlot.LEGS, new ItemStack(Items.DIAMOND_LEGGINGS));
		sp.setItemSlot(EquipmentSlot.FEET, new ItemStack(Items.GOLDEN_BOOTS));
		sp.setItemSlot(EquipmentSlot.MAINHAND, new ItemStack(Items.DIAMOND_SWORD));
		sp.addEffect(new MobEffectInstance(MobEffects.SPEED, 2400, 1));
		sp.addEffect(new MobEffectInstance(MobEffects.STRENGTH, 1200, 0));
	}

	public static void testHurt(ServerPlayer sp) {
		sp.hurt(sp.damageSources().generic(), 1.0F);
	}

	public static void testLiftWithSlowFalling(ServerPlayer sp) {
		sp.addEffect(new MobEffectInstance(MobEffects.SLOW_FALLING, 600, 0));
		sp.teleportTo(sp.getX(), sp.getY() + 30, sp.getZ());
	}

	public static void testScoreboard(MinecraftServer server) {
		Scoreboard sb = server.getScoreboard();
		Objective o = sb.getObjective("zenthra");
		if (o == null) o = sb.addObjective("zenthra", ObjectiveCriteria.DUMMY, Component.literal("Zenthra"), ObjectiveCriteria.RenderType.INTEGER, true, null);
		sb.setDisplayObjective(DisplaySlot.SIDEBAR, o);
		for (int i = 1; i <= 5; i++) sb.getOrCreatePlayerScore(ScoreHolder.forNameOnly("Joueur " + i), o).set(i * 10);
	}

	// ---- Main menu ----

	/** Texture of this mod (path under assets/zenthra/). */
	public static Object texture(String path) {
		return ResourceLocation.fromNamespaceAndPath("zenthra", path);
	}

	public static SkinInfo playerSkin() {
		net.minecraft.client.resources.PlayerSkin skin = mc().getSkinManager().getInsecureSkin(mc().getGameProfile());
		return new SkinInfo(skin.texture(), skin.model() == net.minecraft.client.resources.PlayerSkin.Model.SLIM);
	}
	public static String playerName() {
		return mc().getUser().getName();
	}

	public static boolean isDemo() {
		return mc().isDemo();
	}

	/**
	 * Finds the button with this translation key on a vanilla title screen built off
	 * screen; presses it when press is true. Returns whether it exists and is active.
	 */
	public static boolean titleAction(String key, boolean press) {
		TitleScreen title = new TitleScreen();
		int w = mc().getWindow().getGuiScaledWidth(), h = mc().getWindow().getGuiScaledHeight();
		title.init(mc(), w, h);
		for (Button b : buttonsOf(title)) {
			if (!hasTranslationKey(b.getMessage(), key)) continue;
			if (!b.active) return false;
			if (press) press(b);
			return true;
		}
		return false;
	}
}