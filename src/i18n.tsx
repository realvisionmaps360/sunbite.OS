import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Lang = "pt" | "de";

/**
 * Portugues e alemao. O idioma so muda o que aparece na tela —
 * a venda grava topping por id (almond, coconut, cream) e valor em CHF,
 * entao trocar de idioma nao mexe em nenhum dado ja registrado.
 */
const STRINGS: Record<Lang, Record<string, string>> = {
  pt: {
    "nav.home": "Início",
    "status.synced": "sincronizado",
    "status.pending": "{n} a enviar",
    "status.pending_one": "1 a enviar",
    "status.localOnly": "só no celular",

    "order.new": "Novo pedido",
    "order.cup": "copo",
    "order.cups": "copos",
    "order.cupN": "Copo {n}",
    "order.noTopping": "sem topping",

    "action.addCup": "Adicionar copo",
    "action.undo": "↩︎ Desfazer último",
    "action.finish": "Finalizar",

    "pay.title": "Total a receber",
    "pay.cash": "Dinheiro",
    "pay.twint": "TWINT",
    "pay.back": "Voltar ao pedido",

    "topping.almond": "Amêndoa",
    "topping.coconut": "Coco",
    "topping.cream": "Chantilly",
    "topping.marshmallow": "Marshmallow",

    "sales.title": "Vendas",
    "sales.pure": "puro",
    "sales.empty": "Nenhuma venda registrada.",

    "tab.today": "Hoje",
    "tab.days": "Por dia",
    "tab.summary": "Resumo",

    "stat.sales": "Vendas",
    "stat.cups": "Copos",
    "stat.total": "Total",
    "stat.cashbox": "Dinheiro na caixa: {cash} · TWINT: {twint}",

    "sale.cancel": "Cancelar",
    "sale.cancelAsk": "Cancelar esta venda?",
    "sale.cancelYes": "Sim, cancelar",
    "sale.cancelNo": "Não",
    "sale.cancelled": "cancelada",
    "sale.synced": "sincronizada",
    "sale.pending": "a enviar",

    "day.sales": "vendas",
    "day.cups": "copos",
    "day.cancelled": "{n} cancelada",
    "day.cancelled_other": "{n} canceladas",

    "sum.avgSale": "Média por venda",
    "sum.cupsPerSale": "Copos por venda",
    "sum.bestDay": "Melhor dia",
    "sum.days": "Dias de venda",
    "sum.cancelled": "Canceladas",
    "sum.toppings": "Toppings mais pedidos",
    "sum.noToppings": "Nenhum topping registrado ainda.",
    "sum.season": "Temporada inteira",

    "settings.title": "Ajustes",
    "settings.prices": "Preços",
    "settings.priceLine":
      "Copo {cup} · cada topping +{topping} · copo com chantilly {both}.",
    "settings.priceHint": "Editar preço de venda",
    "settings.supabaseHint":
      "Enquanto não estiver configurado, as vendas ficam só neste celular.",
    "settings.connected": "Conectado a {host}",
    "settings.url": "URL do projeto",
    "settings.key": "Chave anon",
    "settings.save": "Salvar",
    "settings.sync": "Sincronizar",
    "settings.saved": "Configuração salva.",
    "settings.syncing": "Sincronizando…",
    "settings.nothingPending": "Nada a enviar.",
    "settings.sent": "{n} vendas enviadas.",
    "settings.sent_one": "1 venda enviada.",
    "settings.noConfig": "Falta configurar o Supabase.",
    "settings.offline": "Sem internet — as vendas continuam salvas no celular.",
    "settings.error": "Erro: {msg}",
    "settings.device": "Aparelho {id}",

    "settings.danger": "Limpeza",
    "settings.resetHint":
      "Apaga as vendas de hoje. Serve para tirar os testes antes de abrir a temporada. Dias anteriores não são tocados.",
    "settings.reset": "Apagar vendas de hoje",
    "settings.resetAsk": "Apagar as {n} vendas de hoje? Não dá para desfazer.",
    "settings.resetAsk_one": "Apagar a venda de hoje? Não dá para desfazer.",
    "settings.resetYes": "Sim, apagar",
    "settings.resetNo": "Não",
    "settings.resetDone": "{n} vendas apagadas.",
    "settings.resetDone_one": "1 venda apagada.",
    "settings.resetNone": "Nenhuma venda hoje.",
    "settings.system": "Sistema",

    "menu.title": "Cardápio",
    "menu.cup": "Copo de morango com chocolate suíço",
    "menu.cupDesc": "Morangos frescos, chocolate quente na hora, montado na sua frente.",
    "menu.toppings": "Toppings",
    "menu.each": "cada",
    "menu.combos": "Como fica",
    "menu.combo0": "Copo puro",
    "menu.comboN": "Com {n} toppings",
    "menu.comboN_one": "Com 1 topping",
    "menu.comboAll": "Com os {n} toppings",
    "menu.hint": "Arraste para a direita para voltar",

    "review.title": "Conferir",
    "review.cups": "Copos",
    "review.toppings": "Toppings",
    "review.payment": "Pagamento",
    "review.confirm": "Confirmar venda",
    "review.back": "Voltar ao pedido",

    "confirm.next": "toque para o próximo cliente",
    "error.save": "ERRO ao salvar: {msg}",

    "auth.title": "Entrar",
    "auth.email": "E-mail",
    "auth.password": "Senha",
    "auth.enter": "Entrar",
    "auth.entering": "Entrando…",
    "auth.loggedInAs": "Conectado como {email}",
    "auth.signOut": "Sair",
    "auth.offlineBadge": "sessão offline",
    "auth.expiredNotice": "Sessão expirada. Entre novamente.",
    "auth.error": "Erro: {msg}",
    "auth.loadError": "Não deu para abrir agora. Tente de novo com internet.",

    "system.title": "Sistema",
    "system.loadError": "Não deu para abrir agora. Tente de novo com internet.",
    "system.tab.errors": "Erros",
    "system.tab.log": "Log",
    "system.tab.device": "Aparelho",
    "system.log.heading": "Quem fez o quê",
    "system.empty": "Nada registrado ainda.",

    "system.errors.pending": "{n} vendas presas na fila",
    "system.errors.pending_one": "1 venda presa na fila",
    "system.errors.pendingEmpty": "Nenhuma venda presa.",
    "system.errors.lastFailure": "Última falha de sincronização",
    "system.errors.noFailure": "Nenhuma falha registrada.",
    "system.errors.history": "Histórico",

    "system.log.onlyThisDevice": "Só deste aparelho.",
    "system.log.loading": "Carregando…",

    "system.device.connection": "Conexão",
    "system.device.online": "Online",
    "system.device.offline": "Offline",
    "system.device.version": "Versão",
    "system.device.session": "Sessão",
    "system.device.session.deslogado": "Deslogado",
    "system.device.session.ativo": "Ativo",
    "system.device.session.sessao-offline": "Sessão offline",
    "system.device.session.expirado": "Expirada",
    "system.device.storage": "Armazenamento",
    "system.device.storagePersisted": "permanente",
    "system.device.storageNotPersisted": "não permanente",
    "system.device.storageUnknown": "não disponível",
    "system.device.id": "ID do aparelho",
    "system.device.salesCount": "Vendas guardadas",
    "system.device.logCount": "Linhas de log",
    "system.device.updateInfo": "O app se atualiza sozinho ao reabrir.",

    "operation.title": "Operação",
    "operation.loadError": "Não deu para abrir agora. Tente de novo com internet.",
    "operation.loading": "Carregando…",
    "operation.offlineNotice": "Sem internet — as ações ficam na fila e sobem sozinhas.",
    "operation.none": "Nenhuma operação em andamento.",
    "operation.start": "Iniciar operação",
    "operation.open": "Abrir operação",
    "operation.close": "Encerrar operação",
    "operation.cashInitial": "Caixa inicial",
    "operation.cashFinal": "Caixa final",
    "operation.openedInfo": "Aberta às {time} por {who}",
    "operation.summary": "Resumo da operação",
    "operation.goToClose": "Ir para o Encerramento",
    "operation.phase.preparacao": "Preparação",
    "operation.phase.saida": "Saída",
    "operation.phase.operacao": "Operação",
    "operation.phase.encerramento": "Encerramento",

    "checklist.critical": "crítico",
    "checklist.empty": "Nenhum item nesta fase.",

    "pendency.title": "Pendências",
    "pendency.add": "Nova pendência",
    "pendency.placeholder": "Descrever o que falta…",
    "pendency.critical": "Crítica",
    "pendency.resolve": "Concluir",
    "pendency.empty": "Nenhuma pendência aberta.",

    "equipment.title": "Equipamento",
    "equipment.loadError": "Não deu para abrir agora. Tente de novo com internet.",
    "equipment.needsInternet": "Precisa de internet para ver e editar o equipamento.",
    "equipment.empty": "Nenhum equipamento cadastrado.",
    "equipment.add": "Adicionar",
    "equipment.namePlaceholder": "Nome do equipamento…",
    "equipment.notesPlaceholder": "Notas…",
    "equipment.status.ok": "OK",
    "equipment.status.issue": "Com problema",
    "equipment.status.broken": "Quebrado",
    "equipment.status.missing": "Faltando",

    "suppliers.title": "Fornecedores",
    "suppliers.loadError": "Não deu para abrir agora. Tente de novo com internet.",
    "suppliers.needsInternet": "Precisa de internet para ver e editar fornecedores.",
    "suppliers.empty": "Nenhum fornecedor cadastrado.",
    "suppliers.add": "Adicionar",
    "suppliers.namePlaceholder": "Nome do fornecedor…",
    "suppliers.productPlaceholder": "Produto…",
    "suppliers.contactPlaceholder": "Contato…",
    "suppliers.notesPlaceholder": "Notas…",

    "stock.title": "Estoque",
    "stock.loadError": "Não deu para abrir agora. Tente de novo com internet.",
    "stock.needsInternet": "Precisa de internet para adicionar um item novo.",
    "stock.empty": "Nenhum item cadastrado.",
    "stock.addItem": "Novo item",
    "stock.unitPlaceholder": "Unidade (kg, un…)",
    "stock.lowStockWarning": "Estoque baixo.",
    "stock.registerMovement": "Registrar movimento",
    "stock.movementQty": "Quantidade",
    "stock.movementSave": "Salvar",
    "stock.reason.compra": "Compra",
    "stock.reason.uso": "Uso",
    "stock.reason.ajuste": "Ajuste",
    "stock.reason.perda": "Perda",

    "purchases.title": "Compras",
    "purchases.loadError": "Não deu para abrir agora. Tente de novo com internet.",
    "purchases.needsInternet": "Precisa de internet para registrar uma compra.",
    "purchases.new": "Nova compra",
    "purchases.noSupplier": "Fornecedor (opcional)",
    "purchases.addItem": "Adicionar item",
    "purchases.quantity": "Qtd",
    "purchases.unitCost": "Custo un.",
    "purchases.total": "Total: {total}",
    "purchases.save": "Salvar compra",
    "purchases.recent": "Compras recentes",
    "purchases.empty": "Nenhuma compra registrada.",

    "finance.title": "Financeiro",
    "finance.loadError": "Não deu para abrir agora. Tente de novo com internet.",
    "finance.needsInternet": "Precisa de internet para registrar e ver o financeiro.",
    "finance.rule": "Dinheiro no caixa não é automaticamente receita.",
    "finance.newExpense": "Nova despesa/entrada",
    "finance.descriptionPlaceholder": "Descrição…",
    "finance.valuePlaceholder": "Valor (CHF)",
    "finance.save": "Salvar",
    "finance.type.despesa": "Despesa",
    "finance.type.entrada": "Entrada",
    "finance.type.movimento_caixa": "Movimento de caixa",
    "finance.category.ingredientes": "Ingredientes",
    "finance.category.embalagem": "Embalagem",
    "finance.category.operacional": "Operacional",
    "finance.category.equipamentos": "Equipamentos",
    "finance.category.marketing": "Marketing",
    "finance.category.administrativo": "Administrativo",
    "finance.summary": "Resumo por dia",
    "finance.summaryEmpty": "Nada registrado ainda.",
    "finance.dayExtra": "Despesas {despesas} · Entradas {entradas} · Caixa {caixa}",
    "finance.recent": "Lançamentos recentes",
    "finance.empty": "Nenhum lançamento registrado.",

    "prices.title": "Preço de venda",
    "prices.loadError": "Não deu para abrir agora. Tente de novo com internet.",
    "prices.needsInternet": "Precisa de internet para editar o preço.",
    "prices.cup": "Copo",
    "prices.topping": "Cada topping",
    "prices.save": "Salvar",
    "prices.saved": "Preço atualizado.",
    "prices.error": "Erro: {msg}",
    "prices.history": "Histórico",
    "prices.historyEmpty": "Nenhuma mudança registrada ainda.",

    "home.title": "Sunbite",
    "home.sell": "Vender",
    "home.sales": "Vendas",
    "home.menu": "Cardápio",
    "home.operation": "Operação",
    "home.equipment": "Equipamento",
    "home.suppliers": "Fornecedores",
    "home.stock": "Estoque",
    "home.purchases": "Compras",
    "home.finance": "Financeiro",
    "home.settings": "Ajustes",
    "home.system": "Sistema",
    "home.login": "Entrar",
  },

  de: {
    "nav.home": "Start",
    "status.synced": "synchronisiert",
    "status.pending": "{n} zu senden",
    "status.pending_one": "1 zu senden",
    "status.localOnly": "nur lokal",

    "order.new": "Neue Bestellung",
    "order.cup": "Becher",
    "order.cups": "Becher",
    "order.cupN": "Becher {n}",
    "order.noTopping": "ohne Topping",

    "action.addCup": "Becher hinzufügen",
    "action.undo": "↩︎ Rückgängig",
    "action.finish": "Abschliessen",

    "pay.title": "Zu bezahlen",
    "pay.cash": "Bargeld",
    "pay.twint": "TWINT",
    "pay.back": "Zurück zur Bestellung",

    "topping.almond": "Mandeln",
    "topping.coconut": "Kokos",
    "topping.cream": "Rahm",
    "topping.marshmallow": "Marshmallow",

    "sales.title": "Verkäufe",
    "sales.pure": "pur",
    "sales.empty": "Keine Verkäufe erfasst.",

    "tab.today": "Heute",
    "tab.days": "Nach Tag",
    "tab.summary": "Übersicht",

    "stat.sales": "Verkäufe",
    "stat.cups": "Becher",
    "stat.total": "Total",
    "stat.cashbox": "Bargeld in der Kasse: {cash} · TWINT: {twint}",

    "sale.cancel": "Stornieren",
    "sale.cancelAsk": "Diesen Verkauf stornieren?",
    "sale.cancelYes": "Ja, stornieren",
    "sale.cancelNo": "Nein",
    "sale.cancelled": "storniert",
    "sale.synced": "synchronisiert",
    "sale.pending": "zu senden",

    "day.sales": "Verkäufe",
    "day.cups": "Becher",
    "day.cancelled": "{n} storniert",
    "day.cancelled_other": "{n} storniert",

    "sum.avgSale": "Ø pro Verkauf",
    "sum.cupsPerSale": "Becher pro Verkauf",
    "sum.bestDay": "Bester Tag",
    "sum.days": "Verkaufstage",
    "sum.cancelled": "Storniert",
    "sum.toppings": "Beliebteste Toppings",
    "sum.noToppings": "Noch keine Toppings erfasst.",
    "sum.season": "Ganze Saison",

    "settings.title": "Einstellungen",
    "settings.prices": "Preise",
    "settings.priceLine":
      "Becher {cup} · jedes Topping +{topping} · Becher mit Rahm {both}.",
    "settings.priceHint": "Verkaufspreis bearbeiten",
    "settings.supabaseHint":
      "Solange nicht konfiguriert, bleiben die Verkäufe nur auf diesem Handy.",
    "settings.connected": "Verbunden mit {host}",
    "settings.url": "Projekt-URL",
    "settings.key": "Anon-Key",
    "settings.save": "Speichern",
    "settings.sync": "Synchronisieren",
    "settings.saved": "Einstellungen gespeichert.",
    "settings.syncing": "Synchronisiere…",
    "settings.nothingPending": "Nichts zu senden.",
    "settings.sent": "{n} Verkäufe gesendet.",
    "settings.sent_one": "1 Verkauf gesendet.",
    "settings.noConfig": "Supabase ist noch nicht konfiguriert.",
    "settings.offline":
      "Kein Internet — die Verkäufe bleiben auf dem Handy gespeichert.",
    "settings.error": "Fehler: {msg}",
    "settings.device": "Gerät {id}",

    "settings.danger": "Bereinigung",
    "settings.resetHint":
      "Löscht die heutigen Verkäufe. Dient dazu, Tests vor dem Saisonstart zu entfernen. Frühere Tage bleiben unberührt.",
    "settings.reset": "Heutige Verkäufe löschen",
    "settings.resetAsk":
      "Die {n} heutigen Verkäufe löschen? Das lässt sich nicht rückgängig machen.",
    "settings.resetAsk_one":
      "Den heutigen Verkauf löschen? Das lässt sich nicht rückgängig machen.",
    "settings.resetYes": "Ja, löschen",
    "settings.resetNo": "Nein",
    "settings.resetDone": "{n} Verkäufe gelöscht.",
    "settings.resetDone_one": "1 Verkauf gelöscht.",
    "settings.resetNone": "Heute keine Verkäufe.",
    "settings.system": "System",

    "menu.title": "Karte",
    "menu.cup": "Erdbeerbecher mit Schweizer Schokolade",
    "menu.cupDesc": "Frische Erdbeeren, warme Schokolade, frisch vor Ihren Augen zubereitet.",
    "menu.toppings": "Toppings",
    "menu.each": "pro Stück",
    "menu.combos": "Preise",
    "menu.combo0": "Becher pur",
    "menu.comboN": "Mit {n} Toppings",
    "menu.comboN_one": "Mit 1 Topping",
    "menu.comboAll": "Mit allen {n} Toppings",
    "menu.hint": "Nach rechts wischen zum Zurückgehen",

    "review.title": "Prüfen",
    "review.cups": "Becher",
    "review.toppings": "Toppings",
    "review.payment": "Zahlung",
    "review.confirm": "Verkauf bestätigen",
    "review.back": "Zurück zur Bestellung",

    "confirm.next": "tippen für den nächsten Kunden",
    "error.save": "FEHLER beim Speichern: {msg}",

    "auth.title": "Anmelden",
    "auth.email": "E-Mail",
    "auth.password": "Passwort",
    "auth.enter": "Anmelden",
    "auth.entering": "Anmelden…",
    "auth.loggedInAs": "Angemeldet als {email}",
    "auth.signOut": "Abmelden",
    "auth.offlineBadge": "Sitzung offline",
    "auth.expiredNotice": "Sitzung abgelaufen. Bitte erneut anmelden.",
    "auth.error": "Fehler: {msg}",
    "auth.loadError": "Konnte jetzt nicht geöffnet werden. Mit Internet erneut versuchen.",

    "system.title": "System",
    "system.loadError": "Konnte jetzt nicht geöffnet werden. Mit Internet erneut versuchen.",
    "system.tab.errors": "Fehler",
    "system.tab.log": "Log",
    "system.tab.device": "Gerät",
    "system.log.heading": "Wer hat was gemacht",
    "system.empty": "Noch nichts protokolliert.",

    "system.errors.pending": "{n} Verkäufe hängen in der Warteschlange fest",
    "system.errors.pending_one": "1 Verkauf hängt in der Warteschlange fest",
    "system.errors.pendingEmpty": "Kein Verkauf hängt fest.",
    "system.errors.lastFailure": "Letzter Synchronisierungsfehler",
    "system.errors.noFailure": "Kein Fehler protokolliert.",
    "system.errors.history": "Verlauf",

    "system.log.onlyThisDevice": "Nur dieses Gerät.",
    "system.log.loading": "Lade…",

    "system.device.connection": "Verbindung",
    "system.device.online": "Online",
    "system.device.offline": "Offline",
    "system.device.version": "Version",
    "system.device.session": "Sitzung",
    "system.device.session.deslogado": "Abgemeldet",
    "system.device.session.ativo": "Aktiv",
    "system.device.session.sessao-offline": "Sitzung offline",
    "system.device.session.expirado": "Abgelaufen",
    "system.device.storage": "Speicher",
    "system.device.storagePersisted": "dauerhaft",
    "system.device.storageNotPersisted": "nicht dauerhaft",
    "system.device.storageUnknown": "nicht verfügbar",
    "system.device.id": "Geräte-ID",
    "system.device.salesCount": "Gespeicherte Verkäufe",
    "system.device.logCount": "Log-Einträge",
    "system.device.updateInfo": "Die App aktualisiert sich beim erneuten Öffnen selbst.",

    "operation.title": "Betrieb",
    "operation.loadError": "Konnte jetzt nicht geöffnet werden. Mit Internet erneut versuchen.",
    "operation.loading": "Lade…",
    "operation.offlineNotice":
      "Kein Internet — Aktionen bleiben in der Warteschlange und werden automatisch gesendet.",
    "operation.none": "Kein laufender Betrieb.",
    "operation.start": "Betrieb starten",
    "operation.open": "Betrieb eröffnen",
    "operation.close": "Betrieb abschliessen",
    "operation.cashInitial": "Anfangskasse",
    "operation.cashFinal": "Endkasse",
    "operation.openedInfo": "Eröffnet um {time} von {who}",
    "operation.summary": "Betriebsübersicht",
    "operation.goToClose": "Zum Abschluss",
    "operation.phase.preparacao": "Vorbereitung",
    "operation.phase.saida": "Abfahrt",
    "operation.phase.operacao": "Betrieb",
    "operation.phase.encerramento": "Abschluss",

    "checklist.critical": "kritisch",
    "checklist.empty": "Kein Punkt in dieser Phase.",

    "pendency.title": "Pendenzen",
    "pendency.add": "Neue Pendenz",
    "pendency.placeholder": "Was fehlt beschreiben…",
    "pendency.critical": "Kritisch",
    "pendency.resolve": "Erledigt",
    "pendency.empty": "Keine offene Pendenz.",

    "equipment.title": "Ausrüstung",
    "equipment.loadError": "Konnte jetzt nicht geöffnet werden. Mit Internet erneut versuchen.",
    "equipment.needsInternet": "Internet nötig, um die Ausrüstung zu sehen und zu bearbeiten.",
    "equipment.empty": "Keine Ausrüstung erfasst.",
    "equipment.add": "Hinzufügen",
    "equipment.namePlaceholder": "Name der Ausrüstung…",
    "equipment.notesPlaceholder": "Notizen…",
    "equipment.status.ok": "OK",
    "equipment.status.issue": "Problem",
    "equipment.status.broken": "Kaputt",
    "equipment.status.missing": "Fehlt",

    "suppliers.title": "Lieferanten",
    "suppliers.loadError": "Konnte jetzt nicht geöffnet werden. Mit Internet erneut versuchen.",
    "suppliers.needsInternet": "Internet nötig, um Lieferanten zu sehen und zu bearbeiten.",
    "suppliers.empty": "Kein Lieferant erfasst.",
    "suppliers.add": "Hinzufügen",
    "suppliers.namePlaceholder": "Name des Lieferanten…",
    "suppliers.productPlaceholder": "Produkt…",
    "suppliers.contactPlaceholder": "Kontakt…",
    "suppliers.notesPlaceholder": "Notizen…",

    "stock.title": "Lager",
    "stock.loadError": "Konnte jetzt nicht geöffnet werden. Mit Internet erneut versuchen.",
    "stock.needsInternet": "Internet nötig, um einen neuen Artikel hinzuzufügen.",
    "stock.empty": "Kein Artikel erfasst.",
    "stock.addItem": "Neuer Artikel",
    "stock.unitPlaceholder": "Einheit (kg, Stk…)",
    "stock.lowStockWarning": "Niedriger Bestand.",
    "stock.registerMovement": "Bewegung erfassen",
    "stock.movementQty": "Menge",
    "stock.movementSave": "Speichern",
    "stock.reason.compra": "Einkauf",
    "stock.reason.uso": "Verbrauch",
    "stock.reason.ajuste": "Korrektur",
    "stock.reason.perda": "Verlust",

    "purchases.title": "Einkäufe",
    "purchases.loadError": "Konnte jetzt nicht geöffnet werden. Mit Internet erneut versuchen.",
    "purchases.needsInternet": "Internet nötig, um einen Einkauf zu erfassen.",
    "purchases.new": "Neuer Einkauf",
    "purchases.noSupplier": "Lieferant (optional)",
    "purchases.addItem": "Artikel hinzufügen",
    "purchases.quantity": "Menge",
    "purchases.unitCost": "Preis/Einh.",
    "purchases.total": "Total: {total}",
    "purchases.save": "Einkauf speichern",
    "purchases.recent": "Letzte Einkäufe",
    "purchases.empty": "Kein Einkauf erfasst.",

    "finance.title": "Finanzen",
    "finance.loadError": "Konnte jetzt nicht geöffnet werden. Mit Internet erneut versuchen.",
    "finance.needsInternet": "Internet nötig, um Finanzen zu erfassen und zu sehen.",
    "finance.rule": "Geld in der Kasse ist nicht automatisch Umsatz.",
    "finance.newExpense": "Neue Ausgabe/Einnahme",
    "finance.descriptionPlaceholder": "Beschreibung…",
    "finance.valuePlaceholder": "Betrag (CHF)",
    "finance.save": "Speichern",
    "finance.type.despesa": "Ausgabe",
    "finance.type.entrada": "Einnahme",
    "finance.type.movimento_caixa": "Kassenbewegung",
    "finance.category.ingredientes": "Zutaten",
    "finance.category.embalagem": "Verpackung",
    "finance.category.operacional": "Betrieb",
    "finance.category.equipamentos": "Ausrüstung",
    "finance.category.marketing": "Marketing",
    "finance.category.administrativo": "Verwaltung",
    "finance.summary": "Übersicht pro Tag",
    "finance.summaryEmpty": "Noch nichts erfasst.",
    "finance.dayExtra": "Ausgaben {despesas} · Einnahmen {entradas} · Kasse {caixa}",
    "finance.recent": "Letzte Buchungen",
    "finance.empty": "Keine Buchung erfasst.",

    "prices.title": "Verkaufspreis",
    "prices.loadError": "Konnte jetzt nicht geöffnet werden. Mit Internet erneut versuchen.",
    "prices.needsInternet": "Internet nötig, um den Preis zu bearbeiten.",
    "prices.cup": "Becher",
    "prices.topping": "Jedes Topping",
    "prices.save": "Speichern",
    "prices.saved": "Preis aktualisiert.",
    "prices.error": "Fehler: {msg}",
    "prices.history": "Verlauf",
    "prices.historyEmpty": "Noch keine Änderung erfasst.",

    "home.title": "Sunbite",
    "home.sell": "Verkaufen",
    "home.sales": "Verkäufe",
    "home.menu": "Karte",
    "home.operation": "Betrieb",
    "home.equipment": "Ausrüstung",
    "home.suppliers": "Lieferanten",
    "home.stock": "Lager",
    "home.purchases": "Einkäufe",
    "home.finance": "Finanzen",
    "home.settings": "Einstellungen",
    "home.system": "System",
    "home.login": "Anmelden",
  },
};

export type T = (key: string, vars?: Record<string, string | number>) => string;

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggle: () => void;
  t: T;
}

const LangContext = createContext<Ctx | null>(null);
const STORAGE_KEY = "sunbite.lang";

function initial(): Lang {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "de" || saved === "pt" ? saved : "pt";
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);

  // Escolheu uma vez, abre assim para sempre.
  const setLang = useCallback((l: Lang) => {
    localStorage.setItem(STORAGE_KEY, l);
    setLangState(l);
    document.documentElement.lang = l === "de" ? "de-CH" : "pt-BR";
  }, []);

  const toggle = useCallback(
    () => setLang(lang === "pt" ? "de" : "pt"),
    [lang, setLang],
  );

  const t = useCallback<T>(
    (key, vars) => {
      // Plural resolvido aqui: `chave_one` ganha quando n === 1.
      // Evita "1 pendente(s)" espalhado pela tela.
      const singular = vars?.n === 1 ? STRINGS[lang][`${key}_one`] : undefined;
      let s = singular ?? STRINGS[lang][key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          s = s.replaceAll(`{${k}}`, String(v));
        }
      }
      return s;
    },
    [lang],
  );

  const value = useMemo(
    () => ({ lang, setLang, toggle, t }),
    [lang, setLang, toggle, t],
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): Ctx {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang precisa estar dentro de <LangProvider>");
  return ctx;
}

/** Botao de troca. Aparece em todas as telas. */
export function LangToggle({ className = "" }: { className?: string }) {
  const { lang, toggle } = useLang();
  return (
    <button
      onClick={toggle}
      aria-label={lang === "pt" ? "Wechsle zu Deutsch" : "Mudar para português"}
      className={`rounded-full border border-current/40 px-3 py-1 text-sm font-semibold tracking-wide ${className}`}
    >
      <span className={lang === "pt" ? "" : "opacity-40"}>PT</span>
      <span className="mx-1 opacity-40">·</span>
      <span className={lang === "de" ? "" : "opacity-40"}>DE</span>
    </button>
  );
}
