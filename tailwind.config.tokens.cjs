// GENERATED FILE — do not edit; mutate hirobius.tokens.json instead.
// Emitted by scripts/build-tokens.mjs.
//
// Tailwind theme extension bridging HDS role + semantic.shadow tokens to
// utility classes. tailwind.config.* imports this and spreads theme.extend.

/** @type {{ theme: { extend: import('tailwindcss').Config['theme']['extend'] } }} */
const config = {
  theme: {
    extend: {
          "colors": {
                "background": "var(--role-background)",
                "foreground": "var(--role-foreground)",
                "card": {
                      "DEFAULT": "var(--role-card)",
                      "foreground": "var(--role-card-foreground)"
                },
                "popover": {
                      "DEFAULT": "var(--role-popover)",
                      "foreground": "var(--role-popover-foreground)"
                },
                "primary": {
                      "DEFAULT": "var(--role-primary)",
                      "foreground": "var(--role-primary-foreground)"
                },
                "secondary": {
                      "DEFAULT": "var(--role-secondary)",
                      "foreground": "var(--role-secondary-foreground)"
                },
                "muted": {
                      "DEFAULT": "var(--role-muted)",
                      "foreground": "var(--role-muted-foreground)"
                },
                "accent": {
                      "DEFAULT": "var(--role-accent)",
                      "foreground": "var(--role-accent-foreground)"
                },
                "destructive": {
                      "DEFAULT": "var(--role-destructive)",
                      "foreground": "var(--role-destructive-foreground)"
                },
                "border": "var(--role-border)",
                "input": "var(--role-input)",
                "ring": "var(--role-ring)"
          },
          "borderRadius": {
                "lg": "var(--role-radius)",
                "md": "calc(var(--role-radius) - 2px)",
                "sm": "calc(var(--role-radius) - 4px)"
          },
          "boxShadow": {
                "subtle": "var(--semantic-shadow-subtle)",
                "floating": "var(--semantic-shadow-floating)",
                "overlay": "var(--semantic-shadow-overlay)"
          }
    },
  },
};

module.exports = config;
