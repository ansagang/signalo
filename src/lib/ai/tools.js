/**
 * The bot's tools, defined once in a provider-neutral shape.
 *
 * Each spec carries a JSON Schema and a `run(input, ctx)` that performs the
 * write. `ctx` holds { supabase, userId, conversationId, timezone, onEvent }.
 * The engine adapts these specs to whichever provider the persona uses.
 */

import { DEFAULT_TZ } from "@/lib/timezone";
import {
  availableSlots, slotCheck, bookAppointment,
  rescheduleAppointment, cancelAppointment,
} from "@/lib/services/bookings";

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** "2026-09-16 14:00" (shop-local) → a real instant. */
function localToInstant(day, time, timezone) {
  const iso = `${day}T${time.length === 5 ? time : time.slice(0, 5)}:00`;
  // Resolve the zone offset for that date, then subtract it.
  const probe = new Date(`${iso}Z`);
  const asLocal = new Date(
    probe.toLocaleString("en-US", { timeZone: timezone || DEFAULT_TZ }),
  );
  const asUtc = new Date(probe.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(probe.getTime() + (asUtc.getTime() - asLocal.getTime()));
}

function formatSlot(iso, timezone) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: timezone || DEFAULT_TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}


/** Why a time was refused, in words a customer can hear. */
function refusalText(reason) {
  return {
    closed_that_day: "the business is closed that day",
    outside_hours: "it falls outside opening hours",
    too_soon: "it is too soon to book",
    not_a_start_time: "this one only starts at set times",
    all_busy: "everything is taken at that moment",
    person_busy: "that person is busy then",
    no_seats_left: "there are not enough seats left",
    off_grid: "this one only starts on its scheduled times",
    no_such_person: "nobody here does that",
  }[reason];
}

export const toolSpecs = [
  /* ───────────────────────────── selling ───────────────────────────── */
  {
    name: "create_order",
    description:
      "Record a confirmed order for physical products. Call only after the customer has agreed to buy specific items AND given a name or contact. Never call it to check whether they want something.",
    input_schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          description: "The items the customer confirmed.",
          items: {
            type: "object",
            properties: {
              product_id: {
                type: "string",
                description: "The product_id shown in brackets in the catalogue. Required for stock to be tracked.",
              },
              title: { type: "string", description: "Item name as the customer knows it." },
              quantity: { type: "integer", minimum: 1, default: 1 },
              price: { type: "number", description: "Unit price exactly as the catalogue states it." },
            },
            required: ["title", "quantity"],
            additionalProperties: false,
          },
        },
        currency: { type: "string", default: "kzt" },
        customer_name: { type: "string" },
        customer_contact: {
          type: "string",
          description: "Phone, Telegram handle, or email. Never card details.",
        },
        note: { type: "string", description: "Colour, size, delivery preference, anything else specified." },
      },
      required: ["items"],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const items = (input.items || []).map((i) => ({
        product_id: i.product_id || null,
        title: i.title,
        quantity: Math.max(1, num(i.quantity, 1)),
        price: i.price === undefined ? null : num(i.price, 0),
      }));

      if (!items.length) {
        return { ok: false, error: "No items given — ask the customer what they want first." };
      }

      const { data, error } = await ctx.supabase.rpc("record_order", {
        p_user_id: ctx.userId,
        p_items: items,
        p_currency: (input.currency || "kzt").toLowerCase(),
        p_conversation_id: ctx.conversationId,
        p_customer_name: input.customer_name || null,
        p_customer_contact: input.customer_contact || null,
        p_note: input.note || null,
      });

      if (error) {
        const msg = error.message || "";
        if (msg.includes("insufficient_stock")) {
          const [, name, left] = msg.split("insufficient_stock:")[1]?.split(":") || [];
          return {
            ok: false,
            error: `Not enough stock. Tell the customer honestly how many are left and offer an alternative from the catalogue.`,
            detail: msg,
          };
        }
        return { ok: false, error: msg };
      }

      const order = Array.isArray(data) ? data[0] : data;

      if (input.customer_name || input.customer_contact) {
        await ctx.supabase
          .from("conversations")
          .update({
            ...(input.customer_name ? { customer_name: input.customer_name } : {}),
            ...(input.customer_contact ? { phone: input.customer_contact } : {}),
            last_intent: "order",
          })
          .eq("id", ctx.conversationId);
      }

      ctx.onEvent?.({ type: "order", order });

      return {
        ok: true,
        order_id: order.id,
        total: order.total,
        currency: order.currency,
        message:
          "Order recorded and stock updated. Confirm the total back to the customer and say a colleague will follow up about payment and delivery.",
      };
    },
  },

  /* ─────────────────────────── appointments ────────────────────────── */
  {
    name: "check_availability",
    description:
      "Free start times for a bookable service on one day. Always call before offering a time — never invent availability. The list is a set of tidy SUGGESTIONS, not the only minutes that exist: if the customer names a time that is not on it, call this again with `time` to find out whether that exact time can be taken. Returns shop-local times.",
    input_schema: {
      type: "object",
      properties: {
        service_id: { type: "string", description: "The service_id from the catalogue." },
        date: { type: "string", description: "The day to check, as YYYY-MM-DD." },
        party_size: {
          type: "integer",
          minimum: 1,
          description:
            "How many people are coming, in total. Always pass it: 1 for a single appointment, the real number for a table, class or tour. Ask the customer if you do not know yet.",
        },
        time: {
          type: "string",
          description:
            "Optional HH:MM. Pass it when the customer named a time — it answers whether that exact time works, which is not the same as whether it is on the suggested list.",
        },
        resource_name: {
          type: "string",
          description:
            "Only if the customer asked for a specific person by name. Most bookings have nobody attached.",
        },
      },
      required: ["service_id", "date", "party_size"],
      additionalProperties: false,
    },
    async run(input, ctx) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date || "")) {
        return { ok: false, error: "date must be YYYY-MM-DD." };
      }

      let resourceId = null;
      if (input.resource_name) {
        const { data: resource } = await ctx.supabase
          .from("resources")
          .select("id, name")
          .eq("user_id", ctx.userId)
          .eq("active", true)
          .ilike("name", `%${input.resource_name}%`)
          .maybeSingle();
        if (!resource) {
          return {
            ok: false,
            error: `Nothing here is called "${input.resource_name}". Offer the next free time with whatever is available instead.`,
          };
        }
        resourceId = resource.id;
      }

      // A named time is a different question from "what do you suggest".
      if (input.time) {
        if (!/^\d{1,2}:\d{2}$/.test(input.time)) {
          return { ok: false, error: "time must be HH:MM." };
        }
        const hhmm = input.time.length === 4 ? `0${input.time}` : input.time;
        const startsAt = localToInstant(input.date, hhmm, ctx.timezone).toISOString();
        const party = Math.max(1, Number(input.party_size) || 1);

        let row;
        try {
          row = await slotCheck(ctx.supabase, ctx.userId, {
            serviceId: input.service_id,
            startsAt,
            resourceId,
            timezone: ctx.timezone || DEFAULT_TZ,
            party,
          });
        } catch (err) {
          return { ok: false, error: err?.message || "Could not check that time." };
        }

        if (row?.ok) {
          return {
            ok: true,
            exact_time: hhmm,
            available: true,
            seats_left: row.seats_left,
            message: `${hhmm} works. Confirm it back to the customer and book it — do not talk them into a different time.`,
          };
        }

        const why = {
          closed_that_day: "the business is closed that day",
          outside_hours: "that is outside opening hours",
          too_soon: "that is too soon to book",
          not_a_start_time: "this one only starts at set times",
          all_busy: "everything is taken at that moment",
          person_busy: "that person is busy then",
          no_seats_left: "there are not enough seats left then",
          party_out_of_range: "that party size is out of range for this",
          off_grid: "this one only starts at its scheduled times",
        }[row?.reason] || "that time is not available";

        return {
          ok: true,
          exact_time: hhmm,
          available: false,
          reason: row?.reason,
          message: `${hhmm} is not possible — ${why}. Say so plainly, then offer the nearest times from a normal availability check.`,
        };
      }

      // Whether the grid is a suggestion or a rule changes what we may tell
      // the model to do with the list below.
      const { data: svc } = await ctx.supabase
        .from("services")
        .select("slot_mode")
        .eq("id", input.service_id)
        .eq("user_id", ctx.userId)
        .maybeSingle();
      // Only "any" treats its grid as a suggestion.
      const anyTime = svc?.slot_mode === "any";

      let rows;
      try {
        rows = await availableSlots(ctx.supabase, ctx.userId, {
          serviceId: input.service_id,
          date: input.date,
          resourceId,
          timezone: ctx.timezone || DEFAULT_TZ,
          party: Math.max(1, Number(input.party_size) || 1),
        });
      } catch (err) {
        return { ok: false, error: err?.message || "Could not read availability." };
      }
      if (!rows.length) {
        return {
          ok: true,
          slots: [],
          message:
            "Nothing free that day — the shop is closed, no master who does this service is working, or it is fully booked. Offer a different date.",
        };
      }

      // Collapse to one entry per start time, listing what is free for it.
      const byTime = new Map();
      for (const r of rows) {
        const label = formatSlot(r.slot_start, ctx.timezone);
        if (!byTime.has(label)) byTime.set(label, []);
        byTime.get(label).push(r.resource_name);
      }
      const slots = [...byTime.keys()].sort();

      // Thirty times is not a helpful answer, but taking the FIRST eight made
      // the model believe the day ended at the eighth slot and tell customers
      // the afternoon was booked out. Sample across the whole day instead, and
      // state the real range explicitly.
      const SAMPLE = 8;
      const spread =
        slots.length <= SAMPLE
          ? slots
          : Array.from({ length: SAMPLE }, (_, i) =>
              slots[Math.round((i * (slots.length - 1)) / (SAMPLE - 1))],
            );

      return {
        ok: true,
        date: input.date,
        earliest: slots[0],
        latest: slots[slots.length - 1],
        total_free: slots.length,
        exact_times_allowed: anyTime,
        slots: spread.map((t) => ({ time: t, available: byTime.get(t) })),
        message:
          `${slots.length} start times are free, from ${slots[0]} to ${slots[slots.length - 1]}. ` +
          "The list below is a SAMPLE across the day, not everything that is free — never tell the customer a part of the day is unavailable. " +
          (anyTime
            ? "These are suggestions, not the only minutes that exist: any time between " +
              `${slots[0]} and ${slots[slots.length - 1]} can be booked when there is room. ` +
              "If the customer names a time — 19:00, 19:15, anything — do NOT push them onto a listed time. " +
              "Call check_availability again with `time` set to what they asked for, and book it if it comes back available. "
            : "This one only starts at the times listed, so offer them exactly as given. ") +
          "Offer two or three that suit what they asked for. Name the person only if the customer asked for someone specific.",
      };
    },
  },

  {
    name: "book_appointment",
    description:
      "Book a service for a customer at a specific time. Only call after check_availability returned that time AND the customer confirmed it AND gave a name and contact.",
    input_schema: {
      type: "object",
      properties: {
        service_id: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
        time: { type: "string", description: "HH:MM in shop-local time, exactly as offered." },
        customer_name: { type: "string" },
        customer_contact: { type: "string", description: "Phone, Telegram handle, or email." },
        party_size: {
          type: "integer",
          minimum: 1,
          description:
            "How many people are coming, in total. Must match what you passed to check_availability. Never guess 1 for a group booking.",
        },
        resource_name: { type: "string", description: "Only if the customer asked for a specific person by name." },
        note: { type: "string" },
      },
      required: ["service_id", "date", "time", "customer_name", "customer_contact", "party_size"],
      additionalProperties: false,
    },
    async run(input, ctx) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date || "") || !/^\d{2}:\d{2}/.test(input.time || "")) {
        return { ok: false, error: "date must be YYYY-MM-DD and time HH:MM." };
      }

      let resourceId = null;
      if (input.resource_name) {
        const { data: resource } = await ctx.supabase
          .from("resources")
          .select("id")
          .eq("user_id", ctx.userId)
          .eq("active", true)
          .ilike("name", `%${input.resource_name}%`)
          .maybeSingle();
        resourceId = resource?.id || null;
      }

      const startsAt = localToInstant(input.date, input.time, ctx.timezone);

      let appt;
      try {
        appt = await bookAppointment(ctx.supabase, ctx.userId, {
          serviceId: input.service_id,
          startsAt: startsAt.toISOString(),
          resourceId,
          conversationId: ctx.conversationId,
          customerName: input.customer_name || null,
          customerContact: input.customer_contact || null,
          note: input.note || null,
          timezone: ctx.timezone || DEFAULT_TZ,
          party: Math.max(1, Number(input.party_size) || 1),
        });
      } catch (err) {
        if (err?.code === "party_out_of_range") {
          return { ok: false, error: `This takes between ${err.min} and ${err.max} people. Ask the customer for a party size in range.` };
        }
        if (err?.code === "slot_taken") {
          // The reason is known, so say which one rather than a catch-all.
          const said = {
            closed_that_day: "the business is closed that day",
            outside_hours: "it falls outside opening hours",
            too_soon: "it is too soon to book",
            not_a_start_time: "this one only starts at set times",
            all_busy: "everything is taken at that moment",
            person_busy: "that person is busy then",
            no_seats_left: "there are not enough seats left",
            off_grid: "this one only starts on its scheduled times",
            no_such_person: "nobody here does that",
          }[err.reason];
          return {
            ok: false,
            error: said
              ? `Could not book that time — ${said}. Tell the customer plainly, then offer the nearest times from check_availability.`
              : "That time is not bookable. Call check_availability again and offer only what it returns.",
          };
        }
        if ((err?.message || "").includes("service_not_found")) {
          return { ok: false, error: "That service does not exist. Use a service_id from the catalogue." };
        }
        return { ok: false, error: err?.message || "Could not book that time." };
      }


      await ctx.supabase
        .from("conversations")
        .update({
          customer_name: input.customer_name,
          phone: input.customer_contact,
          last_intent: "appointment",
        })
        .eq("id", ctx.conversationId);

      ctx.onEvent?.({ type: "appointment", appointment: appt });

      return {
        ok: true,
        appointment_id: appt.id,
        starts_at: appt.starts_at,
        message: `Booked for ${input.date} at ${input.time}. Confirm that back to the customer with the service name and price.`,
      };
    },
  },

  /* ──────────────────────────── showing things ─────────────────────── */
  {
    name: "reschedule_appointment",
    description:
      "Move one of this customer's existing bookings to a different time. Use it when they want to come at another time rather than cancel. Only bookings listed under 'Already on the books' can be moved — anything else, hand over to a human.",
    input_schema: {
      type: "object",
      properties: {
        appointment_id: {
          type: "string",
          description: "The id shown next to the booking in 'Already on the books'.",
        },
        date: { type: "string", description: "New day, YYYY-MM-DD." },
        time: { type: "string", description: "New start, HH:MM in shop-local time." },
        party_size: { type: "integer", minimum: 1, description: "Only if the number of people changed." },
      },
      required: ["appointment_id", "date", "time"],
      additionalProperties: false,
    },
    async run(input, ctx) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date || "") || !/^\d{1,2}:\d{2}/.test(input.time || "")) {
        return { ok: false, error: "date must be YYYY-MM-DD and time HH:MM." };
      }

      const startsAt = localToInstant(input.date, input.time, ctx.timezone);

      try {
        const { appointment, from } = await rescheduleAppointment(ctx.supabase, ctx.userId, {
          appointmentId: input.appointment_id,
          startsAt: startsAt.toISOString(),
          timezone: ctx.timezone || DEFAULT_TZ,
          party: input.party_size ? Math.max(1, Number(input.party_size)) : undefined,
          scope: ctx.scope,
        });

        ctx.onEvent?.({ type: "rescheduled", appointment });
        return {
          ok: true,
          moved_from: formatSlot(from, ctx.timezone),
          moved_to: formatSlot(appointment.starts_at, ctx.timezone),
          message: "Moved. Confirm the new day and time back to the customer.",
        };
      } catch (err) {
        if (err?.code === "not_yours") {
          return { ok: false, error: "That booking is not one you can change from this chat. Offer to pass the customer to a colleague." };
        }
        if (err?.code === "party_out_of_range") {
          return { ok: false, error: `This takes between ${err.min} and ${err.max} people.` };
        }
        if (err?.code === "slot_taken") {
          const said = refusalText(err.reason);
          return {
            ok: false,
            error: said
              ? `Could not move it — ${said}. Say so plainly, then offer the nearest times from check_availability. The original booking is untouched.`
              : "That time is not available. The original booking is untouched.",
          };
        }
        return { ok: false, error: err?.message || "Could not move that booking." };
      }
    },
  },

  {
    name: "cancel_appointment",
    description:
      "Cancel one of this customer's existing bookings, freeing the time. Only call once the customer has clearly asked to cancel — never to check whether they want to. If they want a different time instead, use reschedule_appointment.",
    input_schema: {
      type: "object",
      properties: {
        appointment_id: {
          type: "string",
          description: "The id shown next to the booking in 'Already on the books'.",
        },
        reason: { type: "string", description: "What the customer said, if they gave a reason." },
      },
      required: ["appointment_id"],
      additionalProperties: false,
    },
    async run(input, ctx) {
      try {
        const appointment = await cancelAppointment(ctx.supabase, ctx.userId, {
          appointmentId: input.appointment_id,
          reason: input.reason,
          scope: ctx.scope,
        });

        ctx.onEvent?.({ type: "cancelled", appointment });
        return {
          ok: true,
          cancelled: formatSlot(appointment.starts_at, ctx.timezone),
          message:
            "Cancelled and the time is free again. Confirm it back to the customer and offer to book another time if they want one.",
        };
      } catch (err) {
        if (err?.code === "not_yours") {
          return { ok: false, error: "That booking is not one you can cancel from this chat. Offer to pass the customer to a colleague." };
        }
        return { ok: false, error: err?.message || "Could not cancel that booking." };
      }
    },
  },

  {
    name: "show_items",
    description:
      "Show the customer picture cards for products or services you are recommending. Call this alongside your reply whenever you name specific items that have a photo — a customer buying something visual wants to see it. Do not describe the cards in your text; they render on their own.",
    input_schema: {
      type: "object",
      properties: {
        product_ids: {
          type: "array",
          description: "product_id values from the catalogue, at most three.",
          items: { type: "string" },
        },
        service_ids: {
          type: "array",
          description: "service_id values from the catalogue, at most three.",
          items: { type: "string" },
        },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const productIds = (input.product_ids || []).slice(0, 3);
      const serviceIds = (input.service_ids || []).slice(0, 3);
      if (!productIds.length && !serviceIds.length) {
        return { ok: false, error: "Give at least one product_id or service_id." };
      }

      const [products, services] = await Promise.all([
        productIds.length
          ? ctx.supabase
              .from("products")
              .select("id, name, description, price, currency, stock, track_stock, image_url")
              .eq("user_id", ctx.userId)
              .eq("active", true)
              .in("id", productIds)
          : { data: [] },
        serviceIds.length
          ? ctx.supabase
              .from("services")
              .select("id, name, description, price, currency, duration_min, image_url")
              .eq("user_id", ctx.userId)
              .eq("active", true)
              .in("id", serviceIds)
          : { data: [] },
      ]);

      const cards = [
        ...(products.data || []).map((p) => ({ kind: "product", ...p })),
        ...(services.data || []).map((s) => ({ kind: "service", ...s })),
      ];

      if (!cards.length) {
        return { ok: false, error: "None of those ids exist. Use ids from the catalogue." };
      }

      ctx.onEvent?.({ type: "cards", cards });
      return {
        ok: true,
        shown: cards.length,
        message: "Cards are on screen. Keep your reply short — do not list the prices again.",
      };
    },
  },

  /* ────────────────────────────── admin ────────────────────────────── */
  {
    name: "capture_contact",
    description:
      "Save the customer's name or contact detail as soon as you learn it, even if they have not decided to buy or book yet.",
    input_schema: {
      type: "object",
      properties: {
        customer_name: { type: "string" },
        customer_contact: { type: "string" },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const patch = {};
      if (input.customer_name) patch.customer_name = input.customer_name;
      if (input.customer_contact) patch.phone = input.customer_contact;
      if (!Object.keys(patch).length) return { ok: false, error: "Nothing to save." };

      patch.last_intent = "lead";

      const { error } = await ctx.supabase
        .from("conversations")
        .update(patch)
        .eq("id", ctx.conversationId);

      if (error) return { ok: false, error: error.message };

      ctx.onEvent?.({ type: "contact", contact: patch });
      return { ok: true, message: "Saved. Carry on naturally." };
    },
  },

  {
    name: "request_human",
    description:
      "Hand the conversation to a human colleague. Use for escalation triggers, complaints, billing or legal issues, or anything the catalogue cannot answer.",
    input_schema: {
      type: "object",
      properties: { reason: { type: "string", description: "One sentence on why this needs a person." } },
      required: ["reason"],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const { error } = await ctx.supabase
        .from("conversations")
        .update({ handoff: true, handoff_at: new Date().toISOString(), status: "escalated", last_intent: "handoff" })
        .eq("id", ctx.conversationId);

      if (error) return { ok: false, error: error.message };

      ctx.onEvent?.({ type: "handoff", reason: input.reason });
      return {
        ok: true,
        message: "A colleague has been notified. Tell the customer someone will pick this up, then stop selling.",
      };
    },
  },
];

export const toolsByName = Object.fromEntries(toolSpecs.map((t) => [t.name, t]));

export async function runTool(name, input, ctx) {
  const spec = toolsByName[name];
  if (!spec) return { ok: false, error: `Unknown tool: ${name}` };
  try {
    return await spec.run(input || {}, ctx);
  } catch (err) {
    return { ok: false, error: err?.message || "Tool failed." };
  }
}

/** Anthropic Messages API tool definitions. */
export function anthropicTools() {
  return toolSpecs.map(({ name, description, input_schema }) => ({
    name,
    description,
    input_schema,
  }));
}

/** OpenAI chat-completions function definitions. */
