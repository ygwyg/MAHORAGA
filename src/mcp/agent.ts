import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Env } from "../env.d";
import { createD1Client, D1Client } from "../storage/d1/client";
import { createAlpacaProviders } from "../providers/alpaca";
import { getDefaultPolicyConfig, PolicyConfig } from "../policy/config";
import { getPolicyConfig } from "../storage/d1/queries/policy-config";
import { generateId } from "../lib/utils";
import { success, failure } from "./types";
import { ErrorCode } from "../lib/errors";
import { insertToolLog } from "../storage/d1/queries/tool-logs";
import { getRiskState, enableKillSwitch, disableKillSwitch } from "../storage/d1/queries/risk-state";
import { PolicyEngine } from "../policy/engine";
import { generateApprovalToken, validateApprovalToken, consumeApprovalToken } from "../policy/approval";
import { createTrade } from "../storage/d1/queries/trades";
import { hmacVerify } from "../lib/utils";
import {
  createJournalEntry,
  logOutcome,
  queryJournal,
  getJournalStats,
  getActiveRules,
  getPreferences,
  setPreferences,
} from "../storage/d1/queries/memory";
import {
  insertRawEvent,
  insertStructuredEvent,
  queryStructuredEvents,
  queryNewsItems,
  insertNewsItem,
} from "../storage/d1/queries/events";
import { computeTechnicals, detectSignals, type TechnicalIndicators, type Signal } from "../providers/technicals";
import { scrapeUrl, extractFinancialData, isAllowedDomain } from "../providers/scraper";
import { createOpenAIProvider } from "../providers/llm/openai";
import { classifyEvent, generateResearchReport, summarizeLearnedRules } from "../providers/llm/classifier";
import { getDTE } from "../providers/alpaca/options";
import type { LLMProvider, OptionsProvider } from "../providers/types";
import type { OptionsOrderPreview } from "./types";

export class MahoragaMcpAgent extends McpAgent<Env> {
  server = new McpServer({
    name: "mahoraga",
    version: "0.3.0",
  });

  private requestId: string = "";
  private policyConfig: PolicyConfig | null = null;

  private llm: LLMProvider | null = null;
  private options: OptionsProvider | null = null;

  async init() {
    this.requestId = generateId();

    const db = createD1Client(this.env.DB);
    const alpaca = createAlpacaProviders(this.env);

    const storedPolicy = await getPolicyConfig(db);
    this.policyConfig = storedPolicy ?? getDefaultPolicyConfig(this.env);

    if (this.env.OPENAI_API_KEY && this.env.FEATURE_LLM_RESEARCH === "true") {
      this.llm = createOpenAIProvider({ apiKey: this.env.OPENAI_API_KEY });
    }

    this.options = alpaca.options;

    this.registerAuthTools(db, alpaca);
    this.registerAccountTools(db, alpaca);
    this.registerPositionTools(db, alpaca);
    this.registerOrderTools(db, alpaca);
    this.registerRiskTools(db, alpaca);
    this.registerMemoryTools(db);
    this.registerMarketDataTools(db, alpaca);
    this.registerTechnicalTools(db, alpaca);
    this.registerEventsTools(db);
    this.registerNewsTools(db);
    this.registerResearchTools(db, alpaca);
    this.registerOptionsTools(db, alpaca);
    this.registerUtilityTools();
  }

  private registerAuthTools(db: ReturnType<typeof createD1Client>, alpaca: ReturnType<typeof createAlpacaProviders>) {
    this.server.tool(
      "auth-verify",
      "Verify that Alpaca API credentials are valid",
      {},
      async () => {
        const startTime = Date.now();
        try {
          const account = await alpaca.trading.getAccount();
          const result = success({
            verified: true,
            account_id: account.id,
            account_number: account.account_number,
            status: account.status,
            paper: this.env.ALPACA_PAPER === "true",
          });
          await insertToolLog(db, {
            request_id: this.requestId,
            tool_name: "auth-verify",
            input: {},
            output: result,
            latency_ms: Date.now() - startTime,
            provider_calls: 1,
          });
          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        } catch (error) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.UNAUTHORIZED, message: String(error) }), null, 2) }],
            isError: true,
          };
        }
      }
    );

    this.server.tool(
      "user-get",
      "Get user/session information and system configuration",
      {},
      async () => {
        const result = success({
          environment: this.env.ENVIRONMENT,
          paper_trading: this.env.ALPACA_PAPER === "true",
          features: {
            llm_research: this.env.FEATURE_LLM_RESEARCH === "true",
            options: this.env.FEATURE_OPTIONS === "true",
          },
          policy: {
            max_position_pct_equity: this.policyConfig!.max_position_pct_equity,
            max_notional_per_trade: this.policyConfig!.max_notional_per_trade,
            max_daily_loss_pct: this.policyConfig!.max_daily_loss_pct,
          },
        });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      }
    );
  }

  private registerAccountTools(db: ReturnType<typeof createD1Client>, alpaca: ReturnType<typeof createAlpacaProviders>) {
    this.server.tool(
      "accounts-get",
      "Get detailed account information including buying power and equity",
      {},
      async () => {
        const startTime = Date.now();
        try {
          const account = await alpaca.trading.getAccount();
          const result = success(account);
          await insertToolLog(db, {
            request_id: this.requestId,
            tool_name: "accounts-get",
            input: {},
            output: result,
            latency_ms: Date.now() - startTime,
            provider_calls: 1,
          });
          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        } catch (error) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.PROVIDER_ERROR, message: String(error) }), null, 2) }],
            isError: true,
          };
        }
      }
    );

    this.server.tool(
      "portfolio-get",
      "Get comprehensive portfolio snapshot with positions and summary",
      {},
      async () => {
        const startTime = Date.now();
        try {
          const [account, positions, clock] = await Promise.all([
            alpaca.trading.getAccount(),
            alpaca.trading.getPositions(),
            alpaca.trading.getClock(),
          ]);

          const totalUnrealizedPl = positions.reduce((sum, p) => sum + p.unrealized_pl, 0);

          const result = success({
            account: {
              equity: account.equity,
              cash: account.cash,
              buying_power: account.buying_power,
            },
            market: {
              is_open: clock.is_open,
              next_open: clock.next_open,
              next_close: clock.next_close,
            },
            positions: positions.map((p) => ({
              symbol: p.symbol,
              qty: p.qty,
              market_value: p.market_value,
              unrealized_pl: p.unrealized_pl,
              current_price: p.current_price,
            })),
            summary: {
              position_count: positions.length,
              total_unrealized_pl: totalUnrealizedPl,
            },
          });

          await insertToolLog(db, {
            request_id: this.requestId,
            tool_name: "portfolio-get",
            input: {},
            output: result,
            latency_ms: Date.now() - startTime,
            provider_calls: 3,
          });

          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        } catch (error) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.PROVIDER_ERROR, message: String(error) }), null, 2) }],
            isError: true,
          };
        }
      }
    );
  }

  private registerPositionTools(db: ReturnType<typeof createD1Client>, alpaca: ReturnType<typeof createAlpacaProviders>) {
    this.server.tool(
      "positions-list",
      "List all current positions",
      { symbol: z.string().optional() },
      async ({ symbol }) => {
        try {
          const positions = await alpaca.trading.getPositions();
          const filtered = symbol
            ? positions.filter((p) => p.symbol.toUpperCase() === symbol.toUpperCase())
            : positions;

          const result = success({
            count: filtered.length,
            positions: filtered.map((p) => ({
              symbol: p.symbol,
              qty: p.qty,
              side: p.side,
              market_value: p.market_value,
              unrealized_pl: p.unrealized_pl,
              current_price: p.current_price,
            })),
          });

          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        } catch (error) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.PROVIDER_ERROR, message: String(error) }), null, 2) }],
            isError: true,
          };
        }
      }
    );

    this.server.tool(
      "positions-close",
      "Close a position (bypasses preview/submit but checks kill switch)",
      {
        symbol: z.string(),
        qty: z.number().positive().optional(),
        percentage: z.number().min(0).max(100).optional(),
      },
      async ({ symbol, qty, percentage }) => {
        try {
          const riskState = await getRiskState(db);
          if (riskState.kill_switch_active) {
            return {
              content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.KILL_SWITCH_ACTIVE, message: riskState.kill_switch_reason ?? "Kill switch active" }), null, 2) }],
              isError: true,
            };
          }

          const order = await alpaca.trading.closePosition(symbol, qty, percentage ? percentage / 100 : undefined);
          const result = success({ message: `Position close order submitted`, order: { id: order.id, symbol: order.symbol, status: order.status } });

          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        } catch (error) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.PROVIDER_ERROR, message: String(error) }), null, 2) }],
            isError: true,
          };
        }
      }
    );
  }

  private registerOrderTools(db: ReturnType<typeof createD1Client>, alpaca: ReturnType<typeof createAlpacaProviders>) {
    this.server.tool(
      "orders-preview",
      "Preview order and get approval token. Does NOT execute. Use orders-submit with the token.",
      {
        symbol: z.string().min(1).max(10),
        side: z.enum(["buy", "sell"]),
        qty: z.number().positive().optional(),
        notional: z.number().positive().optional(),
        order_type: z.enum(["market", "limit", "stop", "stop_limit"]),
        limit_price: z.number().positive().optional(),
        stop_price: z.number().positive().optional(),
        time_in_force: z.enum(["day", "gtc", "ioc", "fok"]).default("day"),
      },
      async (input) => {
        const startTime = Date.now();
        try {
          if (!input.qty && !input.notional) {
            return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.INVALID_INPUT, message: "Either qty or notional required" }), null, 2) }], isError: true };
          }

          const [account, positions, clock, riskState] = await Promise.all([
            alpaca.trading.getAccount(),
            alpaca.trading.getPositions(),
            alpaca.trading.getClock(),
            getRiskState(db),
          ]);

          let estimatedPrice = input.limit_price ?? input.stop_price;
          if (!estimatedPrice) {
            try {
              const quote = await alpaca.marketData.getQuote(input.symbol);
              estimatedPrice = input.side === "buy" ? quote.ask_price : quote.bid_price;
            } catch (err) {
              console.error(`[MCP] Failed to fetch quote for ${input.symbol}:`, err);
              estimatedPrice = 0;
            }
          }

          const estimatedCost = input.notional ?? (input.qty ?? 0) * estimatedPrice;

          // Determine asset class via authoritative API lookup
          let assetClass: "crypto" | "us_equity" = "us_equity";
          const asset = await alpaca.trading.getAsset(input.symbol);
          if (asset?.class === "crypto") {
            assetClass = "crypto";
          }

          const preview = {
            symbol: input.symbol.toUpperCase(),
            asset_class: assetClass,
            side: input.side,
            qty: input.qty,
            notional: input.notional,
            order_type: input.order_type,
            limit_price: input.limit_price,
            stop_price: input.stop_price,
            time_in_force: input.time_in_force,
            estimated_price: estimatedPrice,
            estimated_cost: estimatedCost,
          };

          const policyEngine = new PolicyEngine(this.policyConfig!);
          const policyResult = policyEngine.evaluate({ order: preview, account, positions, clock, riskState });

          if (policyResult.allowed) {
            const approval = await generateApprovalToken({
              preview,
              policyResult,
              secret: this.env.KILL_SWITCH_SECRET,
              db,
              ttlSeconds: this.policyConfig!.approval_token_ttl_seconds,
            });
            policyResult.approval_token = approval.token;
            policyResult.approval_id = approval.approval_id;
            policyResult.expires_at = approval.expires_at;
          }

          const result = success({ preview, policy: policyResult });

          await insertToolLog(db, {
            request_id: this.requestId,
            tool_name: "orders-preview",
            input,
            output: result,
            latency_ms: Date.now() - startTime,
            provider_calls: 5,
          });

          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.INTERNAL_ERROR, message: String(error) }), null, 2) }], isError: true };
        }
      }
    );

    this.server.tool(
      "orders-submit",
      "Execute order with valid approval token from orders-preview",
      { approval_token: z.string().min(1) },
      async ({ approval_token }) => {
        const startTime = Date.now();
        try {
          const riskState = await getRiskState(db);
          if (riskState.kill_switch_active) {
            return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.KILL_SWITCH_ACTIVE, message: riskState.kill_switch_reason ?? "Kill switch active" }), null, 2) }], isError: true };
          }

          const validation = await validateApprovalToken({ token: approval_token, secret: this.env.KILL_SWITCH_SECRET, db });
          if (!validation.valid) {
            return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.INVALID_APPROVAL_TOKEN, message: validation.reason ?? "Invalid token" }), null, 2) }], isError: true };
          }

          const orderParams = validation.order_params!;
          const clock = await alpaca.trading.getClock();
          if (!clock.is_open && orderParams.time_in_force === "day") {
            return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.MARKET_CLOSED, message: "Market closed" }), null, 2) }], isError: true };
          }

          const order = await alpaca.trading.createOrder({
            symbol: orderParams.symbol,
            qty: orderParams.qty,
            notional: orderParams.notional,
            side: orderParams.side,
            type: orderParams.order_type,
            time_in_force: orderParams.time_in_force,
            limit_price: orderParams.limit_price,
            stop_price: orderParams.stop_price,
            client_order_id: validation.approval_id,
          });

          await consumeApprovalToken(db, validation.approval_id!);
          await createTrade(db, {
            approval_id: validation.approval_id,
            alpaca_order_id: order.id,
            symbol: order.symbol,
            side: order.side,
            qty: order.qty ? parseFloat(order.qty) : undefined,
            notional: orderParams.notional,
            order_type: order.type,
            status: order.status,
          });

          const result = success({ message: "Order submitted", order: { id: order.id, symbol: order.symbol, status: order.status } });

          await insertToolLog(db, {
            request_id: this.requestId,
            tool_name: "orders-submit",
            input: { approval_token: "[REDACTED]" },
            output: result,
            latency_ms: Date.now() - startTime,
            provider_calls: 3,
          });

          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.PROVIDER_ERROR, message: String(error) }), null, 2) }], isError: true };
        }
      }
    );

    this.server.tool(
      "orders-list",
      "List orders",
      {
        status: z.enum(["open", "closed", "all"]).default("open"),
        limit: z.number().min(1).max(500).default(50),
      },
      async ({ status, limit }) => {
        try {
          const orders = await alpaca.trading.listOrders({ status, limit });
          const result = success({
            count: orders.length,
            orders: orders.map((o) => ({
              id: o.id,
              symbol: o.symbol,
              side: o.side,
              qty: o.qty,
              type: o.type,
              status: o.status,
              created_at: o.created_at,
            })),
          });
          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.PROVIDER_ERROR, message: String(error) }), null, 2) }], isError: true };
        }
      }
    );

    this.server.tool(
      "orders-cancel",
      "Cancel an order by ID",
      { order_id: z.string() },
      async ({ order_id }) => {
        try {
          await alpaca.trading.cancelOrder(order_id);
          return { content: [{ type: "text" as const, text: JSON.stringify(success({ message: `Order ${order_id} cancelled` }), null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.PROVIDER_ERROR, message: String(error) }), null, 2) }], isError: true };
        }
      }
    );
  }

  private registerRiskTools(db: ReturnType<typeof createD1Client>, alpaca: ReturnType<typeof createAlpacaProviders>) {
    this.server.tool(
      "risk-status",
      "Get current risk status and limits",
      {},
      async () => {
        try {
          const [riskState, account, positions] = await Promise.all([
            getRiskState(db),
            alpaca.trading.getAccount(),
            alpaca.trading.getPositions(),
          ]);

          const totalExposure = positions.reduce((sum, p) => sum + Math.abs(p.market_value), 0);
          const dailyLossPct = riskState.daily_loss_usd / account.equity;

          const result = success({
            kill_switch: { active: riskState.kill_switch_active, reason: riskState.kill_switch_reason },
            daily_loss: { usd: riskState.daily_loss_usd, pct: dailyLossPct, limit_pct: this.policyConfig!.max_daily_loss_pct },
            cooldown: { active: riskState.cooldown_until ? new Date(riskState.cooldown_until) > new Date() : false },
            exposure: { total_usd: totalExposure, position_count: positions.length },
            limits: this.policyConfig,
          });

          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.INTERNAL_ERROR, message: String(error) }), null, 2) }], isError: true };
        }
      }
    );

    this.server.tool(
      "kill-switch-enable",
      "Enable kill switch to halt all trading",
      { reason: z.string().min(1) },
      async ({ reason }) => {
        try {
          await enableKillSwitch(db, reason);
          await alpaca.trading.cancelAllOrders();
          return { content: [{ type: "text" as const, text: JSON.stringify(success({ message: "Kill switch enabled", reason }), null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.INTERNAL_ERROR, message: String(error) }), null, 2) }], isError: true };
        }
      }
    );

    this.server.tool(
      "kill-switch-disable",
      "Disable kill switch (requires secret verification)",
      {
        confirmation: z.string(),
        secret_hash: z.string(),
      },
      async ({ confirmation, secret_hash }) => {
        try {
          if (confirmation !== "CONFIRM_RESUME_TRADING") {
            return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.INVALID_INPUT, message: "Type 'CONFIRM_RESUME_TRADING'" }), null, 2) }], isError: true };
          }
          const isValid = await hmacVerify("DISABLE_KILL_SWITCH", secret_hash, this.env.KILL_SWITCH_SECRET);
          if (!isValid) {
            return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.UNAUTHORIZED, message: "Invalid secret" }), null, 2) }], isError: true };
          }
          await disableKillSwitch(db);
          return { content: [{ type: "text" as const, text: JSON.stringify(success({ message: "Kill switch disabled" }), null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.INTERNAL_ERROR, message: String(error) }), null, 2) }], isError: true };
        }
      }
    );
  }

  private registerUtilityTools() {
    this.server.tool(
      "help-usage",
      "Get help information about using Mahoraga",
      {},
      async () => {
        const result = success({
          name: "Mahoraga MCP Trading Server",
          version: "0.1.0",
          order_flow: ["1. orders-preview -> get approval_token", "2. orders-submit with token"],
          quick_start: ["auth-verify", "portfolio-get", "risk-status", "orders-preview", "orders-submit"],
        });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      }
    );

    this.server.tool(
      "catalog-list",
      "List all available tools",
      {},
      async () => {
        const catalog = [
          { category: "Auth", tools: ["auth-verify", "user-get"] },
          { category: "Account", tools: ["accounts-get", "portfolio-get"] },
          { category: "Positions", tools: ["positions-list", "positions-close"] },
          { category: "Orders", tools: ["orders-preview", "orders-submit", "orders-list", "orders-cancel"] },
          { category: "Risk", tools: ["risk-status", "kill-switch-enable", "kill-switch-disable"] },
          { category: "Memory", tools: ["memory-log-trade", "memory-log-outcome", "memory-query", "memory-summarize", "memory-set-preferences"] },
          { category: "Market Data", tools: ["symbol-overview", "prices-bars", "market-clock", "market-movers", "market-quote"] },
          { category: "Technicals", tools: ["technicals-get", "signals-get", "signals-batch"] },
          { category: "Events", tools: ["events-ingest", "events-list", "events-classify"] },
          { category: "News", tools: ["news-list", "news-index"] },
          { category: "Research", tools: ["symbol-research", "web-scrape-financial"] },
          { category: "Options", tools: ["options-expirations", "options-chain", "options-snapshot", "options-order-preview", "options-order-submit"] },
          { category: "Utility", tools: ["help-usage", "catalog-list"] },
        ];
        return { content: [{ type: "text" as const, text: JSON.stringify(success({ catalog }), null, 2) }] };
      }
    );
  }

  private registerMemoryTools(db: D1Client) {
    this.server.tool(
      "memory-log-trade",
      "Log a trade entry to the journal for later analysis",
      {
        symbol: z.string().min(1),
        side: z.enum(["buy", "sell"]),
        qty: z.number().positive(),
        entry_price: z.number().positive().optional(),
        trade_id: z.string().optional(),
        signals: z.record(z.unknown()).optional(),
        technicals: z.record(z.unknown()).optional(),
        regime_tags: z.array(z.string()).optional(),
        notes: z.string().optional(),
      },
      async (input) => {
        try {
          const journalId = await createJournalEntry(db, {
            symbol: input.symbol.toUpperCase(),
            side: input.side,
            qty: input.qty,
            entry_price: input.entry_price,
            trade_id: input.trade_id,
            signals: input.signals,
            technicals: input.technicals,
            regime_tags: input.regime_tags,
            notes: input.notes,
          });
          return { content: [{ type: "text" as const, text: JSON.stringify(success({ journal_id: journalId, message: "Trade logged" }), null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.INTERNAL_ERROR, message: String(error) }), null, 2) }], isError: true };
        }
      }
    );

    this.server.tool(
      "memory-log-outcome",
      "Log the outcome of a previously logged trade",
      {
        journal_id: z.string().min(1),
        exit_price: z.number().positive(),
        pnl_usd: z.number(),
        pnl_pct: z.number(),
        hold_duration_mins: z.number().nonnegative(),
        outcome: z.enum(["win", "loss", "scratch"]),
        lessons_learned: z.string().optional(),
      },
      async (input) => {
        try {
          await logOutcome(db, {
            journal_id: input.journal_id,
            exit_price: input.exit_price,
            pnl_usd: input.pnl_usd,
            pnl_pct: input.pnl_pct,
            hold_duration_mins: input.hold_duration_mins,
            outcome: input.outcome,
            lessons_learned: input.lessons_learned,
          });
          return { content: [{ type: "text" as const, text: JSON.stringify(success({ message: "Outcome logged" }), null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.INTERNAL_ERROR, message: String(error) }), null, 2) }], isError: true };
        }
      }
    );

    this.server.tool(
      "memory-query",
      "Query journal entries and trading statistics",
      {
        symbol: z.string().optional(),
        outcome: z.enum(["win", "loss", "scratch"]).optional(),
        regime_tag: z.string().optional(),
        days: z.number().min(1).max(365).default(30),
        limit: z.number().min(1).max(100).default(20),
      },
      async (input) => {
        try {
          const [entries, stats, rules] = await Promise.all([
            queryJournal(db, { symbol: input.symbol, outcome: input.outcome, regime_tag: input.regime_tag, limit: input.limit }),
            getJournalStats(db, { symbol: input.symbol, days: input.days }),
            getActiveRules(db),
          ]);
          return { content: [{ type: "text" as const, text: JSON.stringify(success({ entries, stats, active_rules: rules.length }), null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.INTERNAL_ERROR, message: String(error) }), null, 2) }], isError: true };
        }
      }
    );

    this.server.tool(
      "memory-summarize",
      "Use LLM to analyze trading history and extract patterns (requires LLM feature)",
      { days: z.number().min(1).max(365).default(30) },
      async (_input) => {
        if (!this.llm) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.NOT_SUPPORTED, message: "LLM feature not enabled" }), null, 2) }], isError: true };
        }
        try {
          const entries = await queryJournal(db, { limit: 50 });
          const mapped = entries.map((e) => ({
            symbol: e.symbol,
            side: e.side,
            outcome: e.outcome ?? "unknown",
            pnl_pct: e.pnl_pct ?? 0,
            regime_tags: e.regime_tags ?? "",
            signals: e.signals_json ?? "",
            notes: e.notes ?? "",
          }));
          const summary = await summarizeLearnedRules(this.llm, mapped);
          return { content: [{ type: "text" as const, text: JSON.stringify(success({ summary, entries_analyzed: entries.length }), null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.INTERNAL_ERROR, message: String(error) }), null, 2) }], isError: true };
        }
      }
    );

    this.server.tool(
      "memory-set-preferences",
      "Store user trading preferences",
      { preferences: z.record(z.unknown()) },
      async ({ preferences }) => {
        try {
          await setPreferences(db, preferences);
          return { content: [{ type: "text" as const, text: JSON.stringify(success({ message: "Preferences saved" }), null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.INTERNAL_ERROR, message: String(error) }), null, 2) }], isError: true };
        }
      }
    );

    this.server.tool(
      "memory-get-preferences",
      "Get stored user trading preferences",
      {},
      async () => {
        try {
          const preferences = await getPreferences(db);
          return { content: [{ type: "text" as const, text: JSON.stringify(success({ preferences }), null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.INTERNAL_ERROR, message: String(error) }), null, 2) }], isError: true };
        }
      }
    );
  }

  private registerMarketDataTools(db: D1Client, alpaca: ReturnType<typeof createAlpacaProviders>) {
    this.server.tool(
      "symbol-overview",
      "Get comprehensive overview of a symbol including price, position, and recent bars",
      { symbol: z.string().min(1) },
      async ({ symbol }) => {
        const startTime = Date.now();
        try {
          const [snapshot, bars, positions] = await Promise.all([
            alpaca.marketData.getSnapshot(symbol.toUpperCase()),
            alpaca.marketData.getBars(symbol.toUpperCase(), "1Day", { limit: 5 }),
            alpaca.trading.getPositions(),
          ]);

          const position = positions.find((p) => p.symbol.toUpperCase() === symbol.toUpperCase());

          const result = success({
            symbol: symbol.toUpperCase(),
            latest_price: snapshot.latest_trade.price,
            bid: snapshot.latest_quote.bid_price,
            ask: snapshot.latest_quote.ask_price,
            daily_bar: snapshot.daily_bar,
            prev_close: snapshot.prev_daily_bar.c,
            change_pct: ((snapshot.daily_bar.c - snapshot.prev_daily_bar.c) / snapshot.prev_daily_bar.c) * 100,
            volume: snapshot.daily_bar.v,
            recent_bars: bars.slice(-5),
            position: position ? { qty: position.qty, unrealized_pl: position.unrealized_pl, avg_entry: position.avg_entry_price } : null,
          });

          await insertToolLog(db, {
            request_id: this.requestId,
            tool_name: "symbol-overview",
            input: { symbol },
            output: result,
            latency_ms: Date.now() - startTime,
            provider_calls: 3,
          });

          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.PROVIDER_ERROR, message: String(error) }), null, 2) }], isError: true };
        }
      }
    );

    this.server.tool(
      "prices-bars",
      "Get historical price bars for a symbol",
      {
        symbol: z.string().min(1),
        timeframe: z.enum(["1Min", "5Min", "15Min", "1Hour", "1Day"]).default("1Day"),
        limit: z.number().min(1).max(1000).default(100),
      },
      async ({ symbol, timeframe, limit }) => {
        try {
          const bars = await alpaca.marketData.getBars(symbol.toUpperCase(), timeframe, { limit });
          return { content: [{ type: "text" as const, text: JSON.stringify(success({ symbol: symbol.toUpperCase(), timeframe, count: bars.length, bars }), null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.PROVIDER_ERROR, message: String(error) }), null, 2) }], isError: true };
        }
      }
    );

    this.server.tool(
      "market-clock",
      "Get current market clock status",
      {},
      async () => {
        try {
          const clock = await alpaca.trading.getClock();
          return { content: [{ type: "text" as const, text: JSON.stringify(success(clock), null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.PROVIDER_ERROR, message: String(error) }), null, 2) }], isError: true };
        }
      }
    );

    this.server.tool(
      "market-movers",
      "Get top gainers and losers from watchlist symbols",
      { symbols: z.array(z.string()).min(1).max(50) },
      async ({ symbols }) => {
        try {
          const snapshots = await alpaca.marketData.getSnapshots(symbols.map((s) => s.toUpperCase()));
          const movers = Object.entries(snapshots).map(([sym, snap]) => ({
            symbol: sym,
            price: snap.daily_bar.c,
            change_pct: ((snap.daily_bar.c - snap.prev_daily_bar.c) / snap.prev_daily_bar.c) * 100,
            volume: snap.daily_bar.v,
          }));
          movers.sort((a, b) => b.change_pct - a.change_pct);
          const gainers = movers.filter((m) => m.change_pct > 0).slice(0, 10);
          const losers = movers.filter((m) => m.change_pct < 0).sort((a, b) => a.change_pct - b.change_pct).slice(0, 10);
          return { content: [{ type: "text" as const, text: JSON.stringify(success({ gainers, losers }), null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.PROVIDER_ERROR, message: String(error) }), null, 2) }], isError: true };
        }
      }
    );

    this.server.tool(
      "quotes-batch",
      "Get latest quotes for multiple symbols",
      { symbols: z.array(z.string()).min(1).max(100) },
      async ({ symbols }) => {
        try {
          const quotes = await alpaca.marketData.getQuotes(symbols.map((s) => s.toUpperCase()));
          return { content: [{ type: "text" as const, text: JSON.stringify(success({ count: Object.keys(quotes).length, quotes }), null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.PROVIDER_ERROR, message: String(error) }), null, 2) }], isError: true };
        }
      }
    );

    this.server.tool(
      "market-quote",
      "Get a quote for a single symbol (stocks or crypto)",
      { symbol: z.string().min(1) },
      async ({ symbol }) => {
        try {
          const asset = await alpaca.trading.getAsset(symbol);
          const isCrypto = asset?.class === "crypto";
          const snapshot = isCrypto
            ? await alpaca.marketData.getCryptoSnapshot(symbol)
            : await alpaca.marketData.getSnapshot(symbol.toUpperCase());

          const result = success({
            symbol: isCrypto ? symbol : symbol.toUpperCase(),
            price: snapshot.latest_trade.price,
            bid: snapshot.latest_quote.bid_price,
            ask: snapshot.latest_quote.ask_price,
            prev_close: snapshot.prev_daily_bar.c,
            change_pct: ((snapshot.daily_bar.c - snapshot.prev_daily_bar.c) / snapshot.prev_daily_bar.c) * 100,
            volume: snapshot.daily_bar.v,
          });
          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.PROVIDER_ERROR, message: String(error) }), null, 2) }], isError: true };
        }
      }
    );
  }

  private registerTechnicalTools(_db: D1Client, alpaca: ReturnType<typeof createAlpacaProviders>) {
    this.server.tool(
      "technicals-get",
      "Calculate technical indicators for a symbol",
      {
        symbol: z.string().min(1),
        timeframe: z.enum(["1Min", "5Min", "15Min", "1Hour", "1Day"]).default("1Day"),
      },
      async ({ symbol, timeframe }) => {
        try {
          const bars = await alpaca.marketData.getBars(symbol.toUpperCase(), timeframe, { limit: 250 });
          if (bars.length < 20) {
            return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.INVALID_INPUT, message: "Insufficient data for technical analysis" }), null, 2) }], isError: true };
          }
          const technicals = computeTechnicals(symbol.toUpperCase(), bars);
          return { content: [{ type: "text" as const, text: JSON.stringify(success(technicals), null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.PROVIDER_ERROR, message: String(error) }), null, 2) }], isError: true };
        }
      }
    );

    this.server.tool(
      "signals-get",
      "Detect trading signals from technical indicators for a symbol",
      {
        symbol: z.string().min(1),
        timeframe: z.enum(["1Min", "5Min", "15Min", "1Hour", "1Day"]).default("1Day"),
      },
      async ({ symbol, timeframe }) => {
        try {
          const bars = await alpaca.marketData.getBars(symbol.toUpperCase(), timeframe, { limit: 250 });
          if (bars.length < 20) {
            return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.INVALID_INPUT, message: "Insufficient data for signal detection" }), null, 2) }], isError: true };
          }
          const technicals = computeTechnicals(symbol.toUpperCase(), bars);
          const signals = detectSignals(technicals);
          return { content: [{ type: "text" as const, text: JSON.stringify(success({ symbol: symbol.toUpperCase(), timeframe, technicals, signals }), null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.PROVIDER_ERROR, message: String(error) }), null, 2) }], isError: true };
        }
      }
    );

    this.server.tool(
      "signals-batch",
      "Detect trading signals for multiple symbols at once",
      {
        symbols: z.array(z.string()).min(1).max(20),
        timeframe: z.enum(["1Min", "5Min", "15Min", "1Hour", "1Day"]).default("1Day"),
      },
      async ({ symbols, timeframe }) => {
        try {
          const results: Array<{ symbol: string; technicals: TechnicalIndicators; signals: Signal[] }> = [];

          for (const sym of symbols) {
            try {
              const bars = await alpaca.marketData.getBars(sym.toUpperCase(), timeframe, { limit: 250 });
              if (bars.length >= 20) {
                const technicals = computeTechnicals(sym.toUpperCase(), bars);
                const signals = detectSignals(technicals);
                results.push({ symbol: sym.toUpperCase(), technicals, signals });
              }
            } catch (err) {
              console.error(`[MCP] Failed to compute technicals for ${sym}:`, err);
              continue;
            }
          }

          return { content: [{ type: "text" as const, text: JSON.stringify(success({ count: results.length, results }), null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.PROVIDER_ERROR, message: String(error) }), null, 2) }], isError: true };
        }
      }
    );
  }

  private registerEventsTools(db: D1Client) {
    this.server.tool(
      "events-ingest",
      "Manually ingest a raw event for processing",
      {
        source: z.string().min(1),
        source_id: z.string().min(1),
        content: z.string().min(1),
      },
      async ({ source, source_id, content }) => {
        try {
          const eventId = await insertRawEvent(db, { source, source_id, raw_content: content });
          return { content: [{ type: "text" as const, text: JSON.stringify(success({ event_id: eventId, message: "Event ingested" }), null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.INTERNAL_ERROR, message: String(error) }), null, 2) }], isError: true };
        }
      }
    );

    this.server.tool(
      "events-list",
      "List structured events with optional filtering",
      {
        event_type: z.string().optional(),
        symbol: z.string().optional(),
        validated: z.boolean().optional(),
        limit: z.number().min(1).max(100).default(20),
      },
      async (input) => {
        try {
          const events = await queryStructuredEvents(db, {
            event_type: input.event_type,
            symbol: input.symbol,
            validated: input.validated,
            limit: input.limit,
          });
          return { content: [{ type: "text" as const, text: JSON.stringify(success({ count: events.length, events }), null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.INTERNAL_ERROR, message: String(error) }), null, 2) }], isError: true };
        }
      }
    );

    this.server.tool(
      "events-classify",
      "Use LLM to classify raw content into structured event (requires LLM feature)",
      {
        content: z.string().min(1),
        store: z.boolean().default(true),
      },
      async ({ content, store }) => {
        if (!this.llm) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.NOT_SUPPORTED, message: "LLM feature not enabled" }), null, 2) }], isError: true };
        }
        try {
          const classified = await classifyEvent(this.llm, content);
          let eventId: string | null = null;

          if (store) {
            eventId = await insertStructuredEvent(db, {
              event_type: classified.event_type,
              symbols: classified.symbols,
              summary: classified.summary,
              confidence: classified.confidence,
              validated: false,
            });
          }

          return { content: [{ type: "text" as const, text: JSON.stringify(success({ ...classified, event_id: eventId }), null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.INTERNAL_ERROR, message: String(error) }), null, 2) }], isError: true };
        }
      }
    );
  }

  private registerNewsTools(db: D1Client) {
    this.server.tool(
      "news-list",
      "List recent news items with optional filtering",
      {
        symbol: z.string().optional(),
        source: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
      },
      async (input) => {
        try {
          const news = await queryNewsItems(db, {
            symbol: input.symbol,
            source: input.source,
            limit: input.limit,
          });
          return { content: [{ type: "text" as const, text: JSON.stringify(success({ count: news.length, news }), null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.INTERNAL_ERROR, message: String(error) }), null, 2) }], isError: true };
        }
      }
    );

    this.server.tool(
      "news-index",
      "Manually index a news item",
      {
        source: z.string().min(1),
        source_id: z.string().min(1),
        headline: z.string().min(1),
        summary: z.string().optional(),
        url: z.string().url().optional(),
        symbols: z.array(z.string()).default([]),
        published_at: z.string().optional(),
      },
      async (input) => {
        try {
          const newsId = await insertNewsItem(db, {
            source: input.source,
            source_id: input.source_id,
            headline: input.headline,
            summary: input.summary,
            url: input.url,
            symbols: input.symbols.map((s) => s.toUpperCase()),
            published_at: input.published_at,
          });
          return { content: [{ type: "text" as const, text: JSON.stringify(success({ news_id: newsId, message: "News indexed" }), null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.INTERNAL_ERROR, message: String(error) }), null, 2) }], isError: true };
        }
      }
    );
  }

  private registerResearchTools(db: D1Client, alpaca: ReturnType<typeof createAlpacaProviders>) {
    this.server.tool(
      "symbol-research",
      "Generate comprehensive research report for a symbol (requires LLM feature)",
      { symbol: z.string().min(1) },
      async ({ symbol }) => {
        const startTime = Date.now();
        if (!this.llm) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.NOT_SUPPORTED, message: "LLM feature not enabled" }), null, 2) }], isError: true };
        }
        try {
          const [snapshot, bars, positions, news] = await Promise.all([
            alpaca.marketData.getSnapshot(symbol.toUpperCase()),
            alpaca.marketData.getBars(symbol.toUpperCase(), "1Day", { limit: 60 }),
            alpaca.trading.getPositions(),
            queryNewsItems(db, { symbol: symbol.toUpperCase(), limit: 5 }),
          ]);

          const technicals = computeTechnicals(symbol.toUpperCase(), bars);
          const position = positions.find((p) => p.symbol.toUpperCase() === symbol.toUpperCase());

          const report = await generateResearchReport(this.llm, symbol.toUpperCase(), {
            overview: {
              price: snapshot.latest_trade.price,
              change_pct: ((snapshot.daily_bar.c - snapshot.prev_daily_bar.c) / snapshot.prev_daily_bar.c) * 100,
              volume: snapshot.daily_bar.v,
            },
            recentNews: news.map((n) => ({ headline: n.headline, date: n.published_at ?? n.created_at })),
            technicals: technicals as unknown as Record<string, unknown>,
            positions: position ? [{ qty: position.qty, avg_entry_price: position.avg_entry_price }] : [],
          });

          await insertToolLog(db, {
            request_id: this.requestId,
            tool_name: "symbol-research",
            input: { symbol },
            output: { report_length: report.length },
            latency_ms: Date.now() - startTime,
            provider_calls: 5,
          });

          return { content: [{ type: "text" as const, text: JSON.stringify(success({ symbol: symbol.toUpperCase(), report }), null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.INTERNAL_ERROR, message: String(error) }), null, 2) }], isError: true };
        }
      }
    );

    this.server.tool(
      "web-scrape-financial",
      "Scrape financial data from allowed domains (finance.yahoo.com, sec.gov, stockanalysis.com, companiesmarketcap.com)",
      {
        url: z.string().url(),
        symbol: z.string().optional(),
      },
      async ({ url, symbol }) => {
        if (!isAllowedDomain(url)) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.FORBIDDEN, message: "Domain not in allowlist" }), null, 2) }], isError: true };
        }
        try {
          const scraped = await scrapeUrl(url);
          const financialData = symbol ? extractFinancialData(scraped.text, symbol) : null;
          return { content: [{ type: "text" as const, text: JSON.stringify(success({ ...scraped, financial_data: financialData }), null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.PROVIDER_ERROR, message: String(error) }), null, 2) }], isError: true };
        }
      }
    );
  }

  private registerOptionsTools(db: ReturnType<typeof createD1Client>, alpaca: ReturnType<typeof createAlpacaProviders>) {
    this.server.tool(
      "options-expirations",
      "Get available option expiration dates for a symbol",
      { underlying: z.string().min(1) },
      async ({ underlying }) => {
        if (!this.options || !this.options.isConfigured()) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.NOT_SUPPORTED, message: "Options provider not configured" }), null, 2) }], isError: true };
        }
        try {
          const expirations = await this.options.getExpirations(underlying.toUpperCase());
          return { content: [{ type: "text" as const, text: JSON.stringify(success({ underlying: underlying.toUpperCase(), expirations }), null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.PROVIDER_ERROR, message: String(error) }), null, 2) }], isError: true };
        }
      }
    );

    this.server.tool(
      "options-chain",
      "Get options chain for a symbol and expiration",
      {
        underlying: z.string().min(1),
        expiration: z.string().min(1),
      },
      async ({ underlying, expiration }) => {
        if (!this.options || !this.options.isConfigured()) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.NOT_SUPPORTED, message: "Options provider not configured" }), null, 2) }], isError: true };
        }
        try {
          const chain = await this.options.getChain(underlying.toUpperCase(), expiration);
          return { content: [{ type: "text" as const, text: JSON.stringify(success(chain), null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.PROVIDER_ERROR, message: String(error) }), null, 2) }], isError: true };
        }
      }
    );

    this.server.tool(
      "options-snapshot",
      "Get current snapshot for an options contract",
      { contract_symbol: z.string().min(1) },
      async ({ contract_symbol }) => {
        if (!this.options || !this.options.isConfigured()) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.NOT_SUPPORTED, message: "Options provider not configured" }), null, 2) }], isError: true };
        }
        try {
          const snapshot = await this.options.getSnapshot(contract_symbol);
          return { content: [{ type: "text" as const, text: JSON.stringify(success(snapshot), null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.PROVIDER_ERROR, message: String(error) }), null, 2) }], isError: true };
        }
      }
    );

    this.server.tool(
      "options-order-preview",
      "Preview options order and get approval token. Does NOT execute. Use options-order-submit with the token.",
      {
        contract_symbol: z.string().min(1),
        side: z.enum(["buy", "sell"]),
        qty: z.number().int().positive(),
        order_type: z.enum(["market", "limit"]),
        limit_price: z.number().positive().optional(),
        time_in_force: z.enum(["day", "gtc"]).default("day"),
      },
      async (input) => {
        const startTime = Date.now();

        if (!this.options || !this.options.isConfigured()) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.NOT_SUPPORTED, message: "Options provider not configured" }), null, 2) }], isError: true };
        }

        try {
          const [account, positions, clock, riskState, snapshot] = await Promise.all([
            alpaca.trading.getAccount(),
            alpaca.trading.getPositions(),
            alpaca.trading.getClock(),
            getRiskState(db),
            this.options.getSnapshot(input.contract_symbol),
          ]);

          const contractParts = this.parseOptionsSymbol(input.contract_symbol);
          if (!contractParts) {
            return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.INVALID_INPUT, message: "Invalid options contract symbol" }), null, 2) }], isError: true };
          }

          const dte = getDTE(contractParts.expiration);
          const estimatedPremium = input.limit_price ?? (input.side === "buy" ? snapshot.latest_quote.ask_price : snapshot.latest_quote.bid_price);
          const estimatedCost = input.qty * estimatedPremium * 100;

          const preview: OptionsOrderPreview = {
            contract_symbol: input.contract_symbol.toUpperCase(),
            underlying: contractParts.underlying,
            side: input.side,
            qty: input.qty,
            order_type: input.order_type,
            limit_price: input.limit_price,
            time_in_force: input.time_in_force,
            expiration: contractParts.expiration,
            strike: contractParts.strike,
            option_type: contractParts.type,
            dte,
            delta: snapshot.greeks?.delta,
            estimated_premium: estimatedPremium,
            estimated_cost: estimatedCost,
          };

          const policyEngine = new PolicyEngine(this.policyConfig!);
          const policyResult = policyEngine.evaluateOptionsOrder({
            order: preview,
            account,
            positions,
            clock,
            riskState,
          });

          if (policyResult.allowed) {
            const approval = await generateApprovalToken({
              preview: {
                symbol: input.contract_symbol.toUpperCase(),
                asset_class: "us_equity",
                side: input.side,
                qty: input.qty,
                order_type: input.order_type,
                limit_price: input.limit_price,
                time_in_force: input.time_in_force,
                estimated_price: estimatedPremium,
                estimated_cost: estimatedCost,
              },
              policyResult,
              secret: this.env.KILL_SWITCH_SECRET,
              db,
              ttlSeconds: this.policyConfig!.approval_token_ttl_seconds,
            });
            policyResult.approval_token = approval.token;
            policyResult.approval_id = approval.approval_id;
            policyResult.expires_at = approval.expires_at;
          }

          const result = success({ preview, policy: policyResult, greeks: snapshot.greeks, iv: snapshot.implied_volatility });

          await insertToolLog(db, {
            request_id: this.requestId,
            tool_name: "options-order-preview",
            input,
            output: result,
            latency_ms: Date.now() - startTime,
            provider_calls: 5,
          });

          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.INTERNAL_ERROR, message: String(error) }), null, 2) }], isError: true };
        }
      }
    );

    this.server.tool(
      "options-order-submit",
      "Execute options order with valid approval token from options-order-preview",
      { approval_token: z.string().min(1) },
      async ({ approval_token }) => {
        const startTime = Date.now();

        try {
          const riskState = await getRiskState(db);
          if (riskState.kill_switch_active) {
            return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.KILL_SWITCH_ACTIVE, message: riskState.kill_switch_reason ?? "Kill switch active" }), null, 2) }], isError: true };
          }

          const validation = await validateApprovalToken({ token: approval_token, secret: this.env.KILL_SWITCH_SECRET, db });
          if (!validation.valid) {
            return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.INVALID_APPROVAL_TOKEN, message: validation.reason ?? "Invalid token" }), null, 2) }], isError: true };
          }

          const orderParams = validation.order_params!;
          const clock = await alpaca.trading.getClock();
          if (!clock.is_open && orderParams.time_in_force === "day") {
            return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.MARKET_CLOSED, message: "Market closed" }), null, 2) }], isError: true };
          }

          const order = await alpaca.trading.createOrder({
            symbol: orderParams.symbol,
            qty: orderParams.qty,
            side: orderParams.side,
            type: orderParams.order_type,
            time_in_force: orderParams.time_in_force,
            limit_price: orderParams.limit_price,
            client_order_id: validation.approval_id,
          });

          await consumeApprovalToken(db, validation.approval_id!);
          await createTrade(db, {
            approval_id: validation.approval_id,
            alpaca_order_id: order.id,
            symbol: order.symbol,
            side: order.side,
            qty: order.qty ? parseFloat(order.qty) : undefined,
            order_type: order.type,
            status: order.status,
          });

          const result = success({ message: "Options order submitted", order: { id: order.id, symbol: order.symbol, status: order.status } });

          await insertToolLog(db, {
            request_id: this.requestId,
            tool_name: "options-order-submit",
            input: { approval_token: "[REDACTED]" },
            output: result,
            latency_ms: Date.now() - startTime,
            provider_calls: 3,
          });

          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: JSON.stringify(failure({ code: ErrorCode.PROVIDER_ERROR, message: String(error) }), null, 2) }], isError: true };
        }
      }
    );
  }

  private parseOptionsSymbol(symbol: string): { underlying: string; expiration: string; type: "call" | "put"; strike: number } | null {
    const match = symbol.match(/^([A-Z]+)(\d{6})([CP])(\d+)$/);
    if (!match) return null;

    const underlying = match[1];
    const dateStr = match[2];
    const typeChar = match[3];
    const strikeStr = match[4];
    
    if (!underlying || !dateStr || !typeChar || !strikeStr) return null;

    const year = 2000 + parseInt(dateStr.slice(0, 2), 10);
    const month = parseInt(dateStr.slice(2, 4), 10);
    const day = parseInt(dateStr.slice(4, 6), 10);
    const expiration = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const type: "call" | "put" = typeChar === "C" ? "call" : "put";
    const strike = parseInt(strikeStr, 10) / 1000;

    return { underlying, expiration, type, strike };
  }
}
