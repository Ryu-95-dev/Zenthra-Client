package client.zenthra.gui;

import client.zenthra.compat.Gfx;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;

/**
 * Friends list. The mod has no network access of its own: the launcher's
 * community client writes <gameDir>/zenthra/friends.json while the game runs
 * (launcher/electron/services/zenthraMod.ts, startFriendsBridge). Nothing is
 * invented: without that file, the screen says what has to be set up.
 */
public class FriendsScreen extends BaseScreen {
	private record Friend(String name, boolean online, String activity) {}

	private static final long STALE_MS = 5 * 60_000L;

	private final List<Friend> friends = new ArrayList<>();
	private String problem;
	private long writtenAt;
	private double scroll;

	public FriendsScreen(Screen parent) {
		super(Component.literal("Amis"), parent);
	}

	@Override
	protected void init() {
		layoutPanel(320, 260);
		button("Actualiser", px + 10, py + ph - 26, 90, 20, b -> load());
		button("Retour", px + pw - 100, py + ph - 26, 90, 20, b -> onClose());
		load();
	}

	private void load() {
		friends.clear();
		problem = null;
		Path file = FabricLoader.getInstance().getGameDir().resolve("zenthra").resolve("friends.json");
		if (!Files.exists(file)) {
			problem = "Lance le jeu depuis Zenthra Client avec un serveur de présence configuré (Paramètres → Confidentialité) et ton compte Microsoft connecté.";
			return;
		}
		try {
			JsonObject o = JsonParser.parseString(Files.readString(file, StandardCharsets.UTF_8).replace("﻿", "")).getAsJsonObject();
			writtenAt = o.has("writtenAt") ? o.get("writtenAt").getAsLong() : 0;
			String status = o.has("status") ? o.get("status").getAsString() : "error";
			switch (status) {
				case "ok" -> {
					JsonArray arr = o.has("friends") ? o.getAsJsonArray("friends") : new JsonArray();
					for (JsonElement el : arr) {
						JsonObject f = el.getAsJsonObject();
						String name = f.has("name") ? f.get("name").getAsString() : "?";
						boolean online = f.has("online") && f.get("online").getAsBoolean();
						String activity = f.has("activity") && !f.get("activity").isJsonNull() ? f.get("activity").getAsString() : null;
						friends.add(new Friend(name, online, activity));
					}
					friends.sort((a, b) -> a.online() == b.online() ? a.name().compareToIgnoreCase(b.name()) : a.online() ? -1 : 1);
				}
				case "not-configured" -> problem = "Aucun serveur de présence n'est configuré dans le launcher (Paramètres → Confidentialité).";
				case "signed-out" -> problem = "Connecte ton compte Microsoft dans le launcher pour voir tes amis.";
				default -> problem = "Serveur communautaire injoignable" + (o.has("message") && !o.get("message").isJsonNull() ? " : " + o.get("message").getAsString() : ".");
			}
		} catch (Exception e) {
			problem = "Liste d'amis illisible.";
		}
	}

	@Override
	protected void renderContent(Gfx g, int mx, int my, float pt) {
		int x = px + 12, w = pw - 24;
		g.text("Amis", x, py + 10, TEXT, false);
		if (writtenAt > 0 && problem == null) {
			long age = System.currentTimeMillis() - writtenAt;
			String info = age > STALE_MS ? "liste ancienne (launcher fermé ?)" : "mis à jour il y a " + Math.max(1, age / 60_000) + " min";
			g.text(info, x + w - font.width(info), py + 10, MUTED, false);
		}
		int top = py + 28, bottom = py + ph - 32;
		if (problem != null) {
			g.wrappedText(problem, x, top + 4, w, MUTED);
			return;
		}
		if (friends.isEmpty()) {
			g.text("Tu n'as pas encore d'amis sur Zenthra.", x, top + 4, MUTED, false);
			g.wrappedText("Ajoute-les depuis le launcher : Multijoueur → Amis.", x, top + 18, w, MUTED);
			return;
		}
		int rowH = 24;
		scroll = Mth.clamp(scroll, 0, Math.max(0, friends.size() * rowH - (bottom - top)));
		g.scissor(x, top, x + w, bottom);
		int y = top - (int) scroll;
		for (Friend f : friends) {
			g.fill(x, y, x + w, y + rowH - 3, CARD);
			int dot = f.online() ? 0xFF3DDC84 : 0xFF6B6577;
			g.fill(x + 7, y + 8, x + 12, y + 13, dot);
			g.text(f.name(), x + 18, y + 3, TEXT, false);
			String sub = f.online() ? (f.activity() != null && !f.activity().isBlank() ? f.activity() : "En ligne") : "Hors ligne";
			g.text(font.plainSubstrByWidth(sub, w - 24), x + 18, y + 12, f.online() ? 0xFF7FE0A8 : MUTED, false);
			y += rowH;
		}
		g.endScissor();
	}

	@Override
	protected boolean zScroll(double mx, double my, double amount) {
		scroll -= amount * 16;
		return true;
	}
}
