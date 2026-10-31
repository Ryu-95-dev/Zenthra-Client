package client.zenthra.config;

import client.zenthra.ZenthraClient;
import client.zenthra.module.Module;
import client.zenthra.module.ModuleManager;
import client.zenthra.module.impl.WaypointsModule;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import net.fabricmc.loader.api.FabricLoader;

/**
 * Reads and writes config/zenthra/zenthra.json (format documented in
 * shared/zenthra-config.md). The launcher may edit "enabled" flags while the
 * game runs, so the file is re-read when its modification time changes.
 */
public final class ConfigManager {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static final int FORMAT_VERSION = 1;

	private final Path file = FabricLoader.getInstance().getConfigDir().resolve("zenthra").resolve("zenthra.json");
	private final Path legacyFile = FabricLoader.getInstance().getConfigDir().resolve("amethyst").resolve("amethyst.json");
	private final ModuleManager modules;
	private long knownMtime = -1;
	private boolean dirty;
	private int ticks;
	/** Unknown top-level keys are preserved for forward compatibility. */
	private JsonObject raw = new JsonObject();

	public ConfigManager(ModuleManager modules) {
		this.modules = modules;
	}

	public void load() {
		raw = new JsonObject();
		// The mod was called "Amethyst" before: reuse its settings if no Zenthra file exists yet.
		Path source = Files.exists(file) || !Files.exists(legacyFile) ? file : legacyFile;
		if (Files.exists(source)) {
			try {
				JsonElement el = JsonParser.parseString(Files.readString(source, StandardCharsets.UTF_8).replace("﻿", ""));
				if (el.isJsonObject()) raw = el.getAsJsonObject();
			} catch (IOException | RuntimeException e) {
				ZenthraClient.LOGGER.warn("Configuration Zenthra illisible, valeurs par défaut utilisées : {}", e.getMessage());
			}
		}
		JsonObject mods = raw.has("modules") && raw.get("modules").isJsonObject() ? raw.getAsJsonObject("modules") : new JsonObject();
		for (Module m : modules.all()) {
			JsonElement el = mods.get(m.id());
			m.load(el != null && el.isJsonObject() ? el.getAsJsonObject() : null);
		}
		WaypointsModule wp = modules.get(WaypointsModule.class);
		wp.loadWaypoints(raw.has("waypoints") && raw.get("waypoints").isJsonArray() ? raw.getAsJsonArray("waypoints") : new JsonArray());
		knownMtime = mtime();
		if (!Files.exists(file)) save();
	}

	public void markDirty() {
		dirty = true;
	}

	/** Called every client tick: flushes pending changes and watches for external edits. */
	public void tick() {
		if (dirty) {
			dirty = false;
			save();
		}
		if (++ticks % 40 == 0) {
			long m = mtime();
			if (m != knownMtime && m != -1) {
				ZenthraClient.LOGGER.info("Configuration modifiée par le launcher, rechargement.");
				load();
			}
		}
	}

	public void save() {
		raw.addProperty("formatVersion", FORMAT_VERSION);
		JsonObject mods = new JsonObject();
		for (Module m : modules.all()) mods.add(m.id(), m.save());
		raw.add("modules", mods);
		raw.add("waypoints", modules.get(WaypointsModule.class).saveWaypoints());
		try {
			Files.createDirectories(file.getParent());
			Path tmp = file.resolveSibling("zenthra.json.tmp");
			Files.writeString(tmp, GSON.toJson(raw), StandardCharsets.UTF_8);
			Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
			knownMtime = mtime();
		} catch (IOException e) {
			ZenthraClient.LOGGER.error("Impossible d'enregistrer la configuration Zenthra", e);
		}
	}

	private long mtime() {
		try {
			return Files.getLastModifiedTime(file).toMillis();
		} catch (IOException e) {
			return -1;
		}
	}
}
