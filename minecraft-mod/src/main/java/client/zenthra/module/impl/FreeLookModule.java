package client.zenthra.module.impl;

import client.zenthra.compat.Platform;
import client.zenthra.ZenthraClient;
import client.zenthra.module.Category;
import client.zenthra.module.Module;
import client.zenthra.module.setting.BooleanSetting;
import client.zenthra.module.setting.ChoiceSetting;
import java.util.List;
import net.minecraft.client.CameraType;
import net.minecraft.util.Mth;

/**
 * Detaches the camera from the player's head: mouse movement rotates the
 * camera only (EntityMixin) and the camera uses these angles (CameraMixin).
 * The player keeps moving in the direction it was facing.
 */
public class FreeLookModule extends Module {
	private final ChoiceSetting mode = add(new ChoiceSetting("mode", "Mode", List.of("hold", "toggle"), List.of("Maintenir", "Basculer"), "hold"));
	private final BooleanSetting thirdPerson = add(new BooleanSetting("third_person", "Passer en vue troisième personne", true));
	private final BooleanSetting invertPitch = add(new BooleanSetting("invert_pitch", "Inverser l'axe vertical", false));

	private boolean active;
	private boolean toggled;
	private float yaw;
	private float pitch;
	private CameraType previousCamera;

	public FreeLookModule() {
		super("freelook", "Free Look", "Regarder autour de soi sans changer la direction du personnage.", Category.CAMERA, true);
	}

	@Override
	public String hint() {
		return "Touche Free Look : Alt gauche par défaut. Certains serveurs l'interdisent : respecte leurs règles.";
	}

	@Override
	public void tick() {
		boolean want;
		if (mode.is("toggle")) {
			while (ZenthraClient.keys().freelook.consumeClick()) toggled = !toggled;
			want = toggled;
		} else {
			want = ZenthraClient.keys().freelook.isDown();
		}
		if (mc.player == null || Platform.screen() != null && !active) want = false;
		if (want && !active) start();
		else if (!want && active) stop();
	}

	private void start() {
		active = true;
		yaw = mc.player.getYRot();
		pitch = mc.player.getXRot();
		previousCamera = mc.options.getCameraType();
		if (thirdPerson.get() && previousCamera == CameraType.FIRST_PERSON) mc.options.setCameraType(CameraType.THIRD_PERSON_BACK);
	}

	private void stop() {
		active = false;
		toggled = false;
		if (previousCamera != null) mc.options.setCameraType(previousCamera);
	}

	@Override
	protected void onDisable() {
		if (active) stop();
	}

	public boolean isActive() {
		return active;
	}

	/** Same scaling as Entity#turn. */
	public void turn(double dx, double dy) {
		yaw += (float) dx * 0.15f;
		pitch = Mth.clamp(pitch + (float) dy * 0.15f * (invertPitch.get() ? -1 : 1), -90f, 90f);
	}

	public float yaw() {
		return yaw;
	}

	public float pitch() {
		return pitch;
	}
}
