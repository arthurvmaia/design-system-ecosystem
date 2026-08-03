export type Viewer = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "client";
};

export type Theme = {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  tokenPrice: number;
  version: string;
  author: string;
  languages: string[];
  sectionCount: number;
  featured: number;
  badge: string | null;
  defaultSettings: Record<string, unknown>;
};

export type Project = {
  id: string;
  themeId: string;
  themeName: string;
  name: string;
  status: "draft" | "editing" | "published" | "archived";
  customization: Record<string, unknown>;
  publishedSlug: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TokenPackage = {
  id: string;
  name: string;
  tokens: number;
  priceCents: number;
};

export type TokenTransaction = {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
};

export type BootstrapData = {
  viewer: Viewer;
  balance: number;
  themes: Theme[];
  projects: Project[];
  packages: TokenPackage[];
  transactions: TokenTransaction[];
  favorites: string[];
};
