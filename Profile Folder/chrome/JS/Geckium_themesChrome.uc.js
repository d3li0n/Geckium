// ==UserScript==
// @name        Geckium - Chromium Theme Manager
// @author      Dominic Hayes
// @loadorder   2
// @include		main
// ==/UserScript==

Components.utils.import("resource://gre/modules/FileUtils.jsm");
const { ColorUtils } = ChromeUtils.importESModule("chrome://modules/content/ChromiumColorUtils.sys.mjs");
// Initial variables
let isChromeThemed;
let isChrThemeNative;
const chrThemesFolder = `file://${FileUtils.getDir("ProfD", []).path.replace(/\\/g, "/")}/chrome/chrThemes`;

// Chrome Themes
class gkChrTheme {
	static get defaultToolbarButtonIconColour() { // TODO: Is this needed, given --default*?
		let appearanceChoice;
		switch (gkPrefUtils.tryGet("Geckium.main.overrideStyle").bool) {
			case true:
				appearanceChoice = gkEras.getEra("Geckium.main.style");
				break;
			default:
				appearanceChoice = gkEras.getEra("Geckium.appearance.choice");
				break;
		}

		if (appearanceChoice <= 6)
			return [88, 118, 171];
		else if (appearanceChoice == 11)
			return [87, 102, 128];
		else if (appearanceChoice <= 68)
			return [111, 111, 111];
	}

	static get getFolderFileUtilsPath() {
		return Services.io.newURI(this.getFolderPath, null, null).QueryInterface(Components.interfaces.nsIFileURL).file.path;
	}
    static async getThemes() {
        var themes = {};
        try {
            const directory = FileUtils.File(this.getFolderFileUtilsPath);

            if (directory.exists() && directory.isDirectory()) {
                var directoryEntries = directory.directoryEntries;
                var fetchPromises = [];

                while (directoryEntries.hasMoreElements()) {
                    const file = directoryEntries.getNext().QueryInterface(Components.interfaces.nsIFile);
                    const themeManifest = `jar:file:///${profilepath}/chrome/${chrThemesFolderName}/${file.leafName}!/manifest.json`;

                    const fetchPromise = fetch(themeManifest)
                        .then((response) => response.json())
                        .then((theme) => {
                            let themeBanner;
							try {
								themeBanner = theme.theme.images.theme_ntp_background;
							} catch (error) {
								themeBanner = undefined;
							}

                            let themeBannerColor;
							try {
								themeBannerColor = theme.theme.colors.frame;
							} catch (error) {
								themeBannerColor = undefined;
							}

							let themeIcon;
							try {
								themeIcon = theme.theme.icons[48];
							} catch (error) {
								try {
									themeIcon = theme.icons[48];
								} catch (error) {
									themeIcon = undefined;
								}
							}

                            themes[theme.name] = {
								banner: themeBanner,
                                color: themeBannerColor,
								icon: themeIcon,
                                description: theme.description,
								file: file.leafName,
                                version: theme.version
                            };
                        })
                        .catch((error) => {
                            console.error("Error fetching theme manifest:", error);
                        });
                    fetchPromises.push(fetchPromise);
                }
                await Promise.all(fetchPromises);
            } else {
                console.error("Directory does not exist or is not a directory:", directoryPath);
            }
        } catch (error) {
            console.error("Error accessing directory:", error);
        }
        return themes;
    }

    static getEligible() {
        let prefChoice = gkPrefUtils.tryGet("extensions.activeThemeID").string;
        // Chromium Themes require Light Theme
        if (prefChoice.startsWith("firefox-compact-light@") && gkLWTheme.palettesMatch("light")) {
            return true;
        }
        return false;
    }

    static async getThemeData(jarpath) {
        try {
            const response = await fetch(jarpath);
            const theme = await response.json();
            return theme;
        } catch (error) {
            console.error('Error fetching theme:', error);
            return null; // Or handle the error appropriately
        }
	}

    static async setVariables(filepath) {
        function styleProperty(key) {
            return `--chrtheme-${key.replace(/_/g, '-')}`;
        }

        let file = `jar:${filepath}!`;
        // Load and apply the selected Chromium Theme
        let theme = await gkChrTheme.getThemeData(`${file}/manifest.json`);
        if (theme == null) {
            return;
        }
        // IMAGES
        if (theme.theme.images) {
            Object.entries(theme.theme.images).map(([key, value]) => {
                document.documentElement.style.setProperty(`${styleProperty(key)}`, `url('${file}/${value}')`);
            }).join('\n');

            // Theme Attribution
            const attributionImg = theme.theme.images.theme_ntp_attribution;
            if (attributionImg) {
                var imagePath = `${file}/${attributionImg}`;
                // Note the attribution image's size
                var img = new Image();
                img.src = imagePath;
                img.onload = function() {
                    document.documentElement.style.setProperty("--chrtheme-ntp-attribution-width", `${this.width}px`);
                    document.documentElement.style.setProperty("--chrtheme-ntp-attribution-height", `${this.height}px`);
                };
            }

            // Titlebar texture (native titlebar check)
            const frameImg = theme.theme.images.theme_frame;
            if (!frameImg) {
                isChrThemeNative = true;
            }
        }

        // COLORS
        if (theme.theme.colors) {
            Object.entries(theme.theme.colors).map(([key, value]) => {
                document.documentElement.style.setProperty(`${styleProperty(key)}`, `rgb(${value.join(', ')})`);
                if (key == "ntp_text") {
                    if (!ColorUtils.IsDark(value)) {
                        document.documentElement.style.setProperty("--chrtheme-ntp-logo-alternate", "1");
                    }
                }
            }).join('\n');
        }

        // MISC. PROPERTIES
        if (theme.theme.properties) {
            Object.entries(theme.theme.properties).map(([key, value]) => {
                switch (key) {
                    case "ntp_logo_alternate":
                        if (theme.theme.colors.ntp_text) {
                            if (!ColorUtils.IsDark(theme.theme.colors.ntp_text))
                                document.documentElement.style.setProperty(`${styleProperty(key)}`, value);
                        }
                        break;
                    default:
                        document.documentElement.style.setProperty(`${styleProperty(key)}`, value);
                        break;
                }
            }).join('\n');
        }

        // TINTS
        let themeTints = (theme.theme.tints) ? theme.theme.tints : theme.tints;
        if (themeTints) {
            Object.entries(themeTints).map(([key, value]) => {
                const percentageValue = value.map((value, index) => (index > 0 ? (value * 100) + '%' : value));
                let tintedColor;
                const tintMap = {
                    "frame": theme.theme.colors.frame,
                    "frame_inactive": theme.theme.colors.frame_inactive,
                    "background_tab": theme.theme.colors.background_tab,
                    "buttons": this.defaultToolbarButtonIconColour
                };
                for (const i of Object.keys(tintMap)) {
                    if (!Object.keys(theme.theme.tints).includes(i)) {
                        continue;
                    }
                    tintedColor = ColorUtils.HSLShift(tintMap[i], value);
                    if (i == "buttons" && JSON.stringify(tintedColor) == JSON.stringify(this.defaultToolbarButtonIconColour)) {
                        // If the tinted colour is the same as the default colour, do NOT tint.
                        continue;
                    }
                    document.documentElement.style.setProperty(
                        `${styleProperty(i == "buttons" ? "toolbar-button-icon" : i)}`,
                        `rgb(${tintedColor})`
                    );
                }
            }).join('\n');
        }

        // Announce the theme usage
        isThemed = true;
        isChromeThemed = true;
        document.documentElement.setAttribute("gkthemed", true);
        document.documentElement.setAttribute("gkchrthemed", true);
    }

    static removeVariables() {
        // Deactivate theme checks
        isChromeThemed = false;
        isChrThemeNative = false;
        document.documentElement.removeAttribute("gkchrthemed");
        if (!gkLWTheme.isThemed) {
            isThemed = false;
            document.documentElement.removeAttribute("gkthemed");
        }
        // Remove variables from CSS
        Array.from(getComputedStyle(document.documentElement)).forEach(propertyName => {
			if (propertyName.startsWith('--chrtheme-')) {
				document.documentElement.style.removeProperty(propertyName);
			}
		});
    }

    static applyTheme() {
        // TODO: Store theme as filename, NOT filepath
        setTimeout(() => { // same situation as themesLW. :/
            let prefChoice = gkPrefUtils.tryGet("Geckium.chrTheme.filePath").string;
            gkChrTheme.removeVariables(); // Not all variables can be ensured to be replaced, thus pre-emptively remove EVERY possible variable.
            if (gkChrTheme.getEligible() && prefChoice) {
                gkChrTheme.setVariables(prefChoice);
            }
            // Reapply titlebar to toggle native mode if applicable to
            gkTitlebars.applyTitlebar();
        }, 0);
    }

    // TODO: When switching Firefox Theme IDs, yeet the current Chrome Theme as the user is clearly intending to apply vanilla Firefox themes.
}
window.addEventListener("load", gkChrTheme.applyTheme);
Services.obs.addObserver(gkChrTheme.applyTheme, "lightweight-theme-styling-update"); //Disable upon failing criteria

const chrThemeObs = {
	observe: function (subject, topic, data) {
		gkChrTheme.applyTheme();
	},
};
Services.prefs.addObserver("Geckium.chrTheme.filePath", chrThemeObs, false);
Services.prefs.addObserver("Geckium.chrTheme.status", chrThemeObs, false);