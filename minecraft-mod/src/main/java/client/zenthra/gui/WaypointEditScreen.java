package client.zenthra.gui;

import client.zenthra.ZenthraClient;
import client.zenthra.compat.Platform;
import client.zenthra.module.impl.WaypointsModule;
import client.zenthra.module.impl.WaypointsModule.Waypoint;
import client.zenthra.module.setting.ColorSetting;
import client.zenthra.compat.Gfx;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/** Creates or edits a waypoint: name, colour and coordinates. */
public class WaypointEditScreen extends BaseScreen {
	private final Waypoint waypoint;
	private final boolean isNew;
	private EditBox name, x, y, z;
	private int color;
	private String error;

	public WaypointEditScreen(Screen parent, Waypoint waypoint, boolean isNew) {
		super(Component.literal(isNew ? "Nouveau repère" : "Modifier le repère"), parent);
		this.waypoint = waypoint;
		this.isNew = isNew;
		this.color = waypoint.color;
	}

	@Override
	protected void init() {
		layoutPanel(300, 170);
		int lx = px + 12, fw = pw - 24;
		name = editBox(lx, py + 34, fw, 16, "Nom");
		name.setMaxLength(32);
		name.setValue(waypoint.name);
		int cw = (fw - 8) / 3;
		x = coord(lx, waypoint.x, cw);
		y = coord(lx + cw + 4, waypoint.y, cw);
		z = coord(lx + 2 * (cw + 4), waypoint.z, cw);
		setInitialFocus(name);

		int by = py + ph - 26;
		button("Enregistrer", px + pw - 196, by, 90, 20, b -> save());
		button("Annuler", px + pw - 100, by, 90, 20, b -> onClose());
	}

	private EditBox coord(int bx, int value, int w) {
		EditBox box = editBox(bx, py + 74, w, 16, "Coordonnée");
		box.setMaxLength(9);
		box.setValue(String.valueOf(value));
		Platform.integerOnly(box);
		return box;
	}

	private void save() {
		String n = name.getValue().trim();
		if (n.isEmpty()) {
			error = "Le nom est obligatoire.";
			return;
		}
		try {
			waypoint.x = Integer.parseInt(x.getValue());
			waypoint.y = Integer.parseInt(y.getValue());
			waypoint.z = Integer.parseInt(z.getValue());
		} catch (NumberFormatException e) {
			error = "Coordonnées invalides.";
			return;
		}
		waypoint.name = n;
		waypoint.color = color;
		if (isNew) ZenthraClient.modules().get(WaypointsModule.class).add(waypoint);
		else ZenthraClient.config().markDirty();
		onClose();
	}

	@Override
	protected void renderContent(Gfx g, int mx, int my, float pt) {
		int lx = px + 12;
		g.text(getTitle().getString(), lx, py + 10, TEXT, false);
		g.text("Nom", lx, py + 24, MUTED, false);
		g.text("X           Y           Z", lx, py + 64, MUTED, false);
		g.text("Couleur", lx, py + 100, MUTED, false);
		int sx = lx;
		for (int c : ColorSetting.PRESETS) {
			if ((c & 0xFFFFFF) == (color & 0xFFFFFF)) g.fill(sx - 1, py + 111, sx + 13, py + 125, 0xFFFFFFFF);
			g.fill(sx, py + 112, sx + 12, py + 124, c);
			final int col = c;
			region(sx, py + 111, 13, 14, () -> color = col);
			sx += 16;
		}
		if (error != null) g.text(error, lx, py + ph - 20, 0xFFF87171, false);
	}
}
