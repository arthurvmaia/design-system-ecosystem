-- A governança do kit: quem manda em quê.
--
-- Aditiva por construção. Todo kit existente continua válido: `origem_base`
-- nasce nula (base em aberto) e a tabela de regras nasce vazia (nenhuma
-- categoria travada), que é exatamente o comportamento de antes desta migração.
ALTER TABLE `kits` ADD `origem_base` text REFERENCES design_systems(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE TABLE `kit_regras_de_origem` (
	`kit_id` text NOT NULL,
	`categoria` text NOT NULL,
	`design_system_id` text NOT NULL,
	PRIMARY KEY(`kit_id`, `categoria`),
	FOREIGN KEY (`kit_id`) REFERENCES `kits`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`design_system_id`) REFERENCES `design_systems`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `kit_regras_kit_idx` ON `kit_regras_de_origem` (`kit_id`);
--> statement-breakpoint
ALTER TABLE `kit_components` ADD `papel` text;
