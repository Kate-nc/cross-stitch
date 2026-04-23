/* insights-engine.js — Brief E
   Pure functions that take stats data and return human-readable insight
   strings, weekly summary paragraphs, and per-project projections.

   No DOM, no React, no IndexedDB — every input is passed in. This makes
   the engine straightforward to unit-test in Node and lets the UI layer
   (stats-insights.js) treat insights as plain data.

   Exposes window.InsightsEngine (also exports for CommonJS in tests). */

(function (global) {
  'use strict';

  // ── Helpers ────────────────────────────────────────────────────────────────
  // Hoisted: reused by fmtDate; avoids reallocating the options object per call.
  var DATE_FORMAT_OPTIONS = { day: 'numeric', month: 'short', year: 'numeric' };

  function ymd(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function mondayOf(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var dow = x.getDay() === 0 ? 6 : x.getDay() - 1;
    x.setDate(x.getDate() - dow);
    return x;
  }
  function pickVariant(arr, seed) {
    if (!arr.length) return '';
    var i = (typeof seed === 'number' ? seed : Math.floor(Date.now() / 86400000)) % arr.length;
    return arr[Math.abs(i)];
  }
  function fmtNum(n) {
    return (n || 0).toLocaleString('en-GB');
  }
  function fmtDate(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', DATE_FORMAT_OPTIONS);
  }

  // ── Weekly summary ──────────────────────────────────────────────────────────
  // tw / lw: { stitches, seconds, speed, activeDays }
  function generateWeeklySummary(tw, lw, opts) {
    tw = tw || { stitches: 0, seconds: 0, speed: 0, activeDays: 0 };
    lw = lw || { stitches: 0, seconds: 0, speed: 0, activeDays: 0 };
    var seed = (opts && typeof opts.seed === 'number') ? opts.seed : null;
    var parts = [];

    // Volume
    if (tw.stitches === 0) {
      parts.push(pickVariant([
        "No stitches this week yet \u2014 there's still time to pick up a needle!",
        "A quiet week so far. Even 10 minutes counts \u2014 give it a try.",
        "No stitches logged this week. Your projects are waiting whenever you are."
      ], seed));
    } else {
      var delta = tw.stitches - lw.stitches;
      if (lw.stitches === 0 && delta > 0) {
        parts.push(pickVariant([
          'Welcome back! ' + fmtNum(tw.stitches) + ' stitches this week after a quiet last week.',
          'Lovely \u2014 ' + fmtNum(tw.stitches) + ' stitches this week. You\u2019re back in the rhythm.'
        ], seed));
      } else if (delta > 0) {
        var pct = Math.round(delta / Math.max(1, lw.stitches) * 100);
        parts.push(pickVariant([
          'Great week! You stitched ' + fmtNum(tw.stitches) + ' stitches \u2014 ' + pct + '% more than last week.',
          fmtNum(tw.stitches) + ' stitches this week, ' + pct + '% up on last \u2014 you\u2019re building momentum!',
          'You\u2019re on a roll: ' + fmtNum(tw.stitches) + ' stitches (+' + pct + '%) compared with last week.'
        ], seed));
      } else if (delta < 0) {
        parts.push(pickVariant([
          'You stitched ' + fmtNum(tw.stitches) + ' this week, a bit less than last week\u2019s ' + fmtNum(lw.stitches) + '. Quiet weeks are part of the rhythm.',
          fmtNum(tw.stitches) + ' stitches this week \u2014 lighter than the ' + fmtNum(lw.stitches) + ' last week, but still progress.'
        ], seed));
      } else {
        parts.push(pickVariant([
          'You stitched ' + fmtNum(tw.stitches) + ' stitches this week \u2014 same as last week. Wonderfully consistent!',
          'Identical to last week: ' + fmtNum(tw.stitches) + ' stitches. That kind of consistency adds up.'
        ], seed));
      }
    }

    // Speed
    if (tw.speed > 0 && lw.speed > 0) {
      var sd = tw.speed - lw.speed;
      if (sd > 10) parts.push(pickVariant([
        'Your pace picked up too \u2014 ' + tw.speed + ' st/hr vs ' + lw.speed + ' last week.',
        'You\u2019re faster too: ' + tw.speed + ' st/hr (up from ' + lw.speed + ').'
      ], seed));
      else if (sd < -10) parts.push(pickVariant([
        'You took it a bit slower at ' + tw.speed + ' st/hr.',
        'A more relaxed pace this week \u2014 ' + tw.speed + ' st/hr.'
      ], seed));
    }

    // Active days
    if (tw.activeDays >= 5) {
      parts.push(pickVariant([
        tw.activeDays + ' active days \u2014 impressive dedication.',
        'Stitched on ' + tw.activeDays + ' days this week. That\u2019s a habit forming.'
      ], seed));
    }

    return parts.join(' ');
  }

  // ── Streak (weekly) ─────────────────────────────────────────────────────────
  // Counts consecutive ISO weeks ending this week with at least one session.
  function computeWeeklyStreak(allSessions, today) {
    today = today || new Date();
    if (!Array.isArray(allSessions) || allSessions.length === 0) return 0;
    var weeks = {};
    for (var i = 0; i < allSessions.length; i++) {
      var s = allSessions[i];
      var d = s && s.date ? new Date(s.date + 'T12:00:00') : (s && s.startTime ? new Date(s.startTime) : null);
      if (!d || isNaN(d.getTime())) continue;
      weeks[ymd(mondayOf(d))] = true;
    }
    var streak = 0;
    var cursor = mondayOf(today);
    // Allow current week to count even if not yet stitched: only break the
    // streak when a *previous* week is missing.
    var checkedThisWeek = false;
    while (true) {
      var key = ymd(cursor);
      if (weeks[key]) {
        streak++;
      } else if (checkedThisWeek) {
        break;
      }
      checkedThisWeek = true;
      cursor.setDate(cursor.getDate() - 7);
      if (streak > 520) break; // hard cap (10 yrs)
    }
    return streak;
  }

  // ── Projections per project ────────────────────────────────────────────────
  // projects: [{ id, name, totalStitches, completedStitches, statsSessions, projectColor? }]
  // Returns: [{ id, name, completionDate, daysRemaining, stitchesPerHour, recentPaceStPerDay, percent, status, projectedText }]
  function generateProjections(projects, opts) {
    if (!Array.isArray(projects)) return [];
    var now = (opts && opts.now) ? new Date(opts.now) : new Date();
    var dayMs = 86400000;
    return projects.map(function (p) {
      var total = p.totalStitches || 0;
      var done = p.completedStitches || 0;
      var pct = total > 0 ? Math.round(done / total * 100) : 0;
      var remaining = Math.max(0, total - done);
      var sessions = Array.isArray(p.statsSessions) ? p.statsSessions : [];

      // Recent pace: weighted (recent days count more), 14-day window.
      // Active days = unique session dates in the window.
      var windowStart = new Date(now.getTime() - 14 * dayMs);
      var recentSessions = sessions.filter(function (s) {
        if (!s || !s.date) return false;
        return new Date(s.date + 'T12:00:00').getTime() >= windowStart.getTime();
      });
      var activeDays = new Set(recentSessions.map(function (s) { return s.date; })).size;
      var recentStitches = recentSessions.reduce(function (a, s) { return a + (s.netStitches || 0); }, 0);
      var recentSeconds = recentSessions.reduce(function (a, s) {
        return a + (s.durationSeconds != null ? s.durationSeconds : (s.durationMinutes || 0) * 60);
      }, 0);
      var stitchesPerHour = recentSeconds > 0 ? Math.round(recentStitches / (recentSeconds / 3600)) : 0;
      var pacePerDay = activeDays > 0 ? recentStitches / activeDays : 0;

      var status, completionDate = null, daysRemaining = null, projectedText;
      if (total > 0 && done >= total) {
        status = 'complete';
        projectedText = 'Complete!';
      } else if (activeDays < 3 || pacePerDay <= 0) {
        status = 'paused';
        projectedText = 'No recent sessions \u2014 can\u2019t project.';
      } else {
        status = 'projected';
        // Project forward using calendar-day pace (stitches per active day,
        // assumed to recur weekly). Use 7/active days as a rough multiplier
        // so a user who stitches 2 days/week gets a realistic estimate.
        var perCalendarDay = pacePerDay * (activeDays / 14); // active days per calendar day
        if (perCalendarDay <= 0) perCalendarDay = pacePerDay / 7;
        daysRemaining = Math.ceil(remaining / perCalendarDay);
        completionDate = new Date(now.getTime() + daysRemaining * dayMs);
        projectedText = '~' + fmtDate(completionDate) + ' at current pace';
      }
      return {
        id: p.id,
        name: p.name || 'Untitled',
        projectColor: p.projectColor || null,
        totalStitches: total,
        completedStitches: done,
        remaining: remaining,
        percent: pct,
        status: status,
        completionDate: completionDate,
        daysRemaining: daysRemaining,
        stitchesPerHour: stitchesPerHour,
        recentPacePerDay: Math.round(pacePerDay),
        activeDaysLast14: activeDays,
        projectedText: projectedText
      };
    });
  }

  // ── Stitching rhythm matrix (7x24) ─────────────────────────────────────────
  function buildRhythmMatrix(allSessions) {
    var grid = [];
    for (var d = 0; d < 7; d++) {
      grid.push([0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]);
    }
    var max = 0, total = 0;
    if (!Array.isArray(allSessions)) return { grid: grid, max: 0, total: 0 };
    for (var i = 0; i < allSessions.length; i++) {
      var s = allSessions[i];
      if (!s || !s.startTime) continue;
      var dt = new Date(s.startTime);
      if (isNaN(dt.getTime())) continue;
      var dow = dt.getDay() === 0 ? 6 : dt.getDay() - 1; // Mon=0..Sun=6
      var hr = dt.getHours();
      var inc = s.netStitches || 1;
      grid[dow][hr] += inc;
      total++;
      if (grid[dow][hr] > max) max = grid[dow][hr];
    }
    return { grid: grid, max: max, total: total };
  }

  // Returns peak (dow, hour) plus peak hour of all sessions.
  function getPeakHour(allSessions) {
    if (!Array.isArray(allSessions) || allSessions.length === 0) return null;
    var hours = new Array(24).fill(0);
    for (var i = 0; i < allSessions.length; i++) {
      var s = allSessions[i];
      if (!s || !s.startTime) continue;
      var dt = new Date(s.startTime);
      if (isNaN(dt.getTime())) continue;
      hours[dt.getHours()]++;
    }
    var peak = 0, max = 0;
    for (var h = 0; h < 24; h++) {
      if (hours[h] > max) { max = hours[h]; peak = h; }
    }
    return max > 0 ? peak : null;
  }
  // Returns {dow, hr, count} for the hottest cell in a 7x24 rhythm grid
  // produced by buildRhythmMatrix, or null if the grid is empty.
  function getPeakCell(grid) {
    if (!Array.isArray(grid) || grid.length === 0) return null;
    var best = null;
    for (var d = 0; d < grid.length; d++) {
      var row = grid[d] || [];
      for (var h = 0; h < row.length; h++) {
        if (row[h] > 0 && (!best || row[h] > best.count)) {
          best = { dow: d, hr: h, count: row[h] };
        }
      }
    }
    return best;
  }
  function fmtHour(h) {
    if (h == null) return '';
    if (h === 0) return '12am';
    if (h === 12) return '12pm';
    return h < 12 ? h + 'am' : (h - 12) + 'pm';
  }

  // ── Generate insight cards ─────────────────────────────────────────────────
  // data: {
  //   summaries: [{id,name,statsSessions,totalStitches,completedStitches,palette,...}],
  //   allSessions: flat array of all sessions across projects,
  //   thisWeek, lastWeek: weekComparison-style objects,
  //   stash: optional global stash object (composite keys),
  //   mostUsedColours: array from getMostUsedColours,
  //   colourCompletion: optional [{id,name,pct,remaining}] for the closest-to-complete thread,
  //   dismissed: optional Set or array of insight IDs,
  // }
  // Returns: [{ id, iconName, tone, text }]
  function generateInsights(data, opts) {
    data = data || {};
    var seed = (opts && typeof opts.seed === 'number') ? opts.seed : null;
    var dismissed = data.dismissed instanceof Set
      ? data.dismissed
      : new Set(Array.isArray(data.dismissed) ? data.dismissed : []);
    var out = [];
    function add(id, iconName, tone, text) {
      if (!text) return;
      if (dismissed.has(id)) return;
      out.push({ id: id, iconName: iconName, tone: tone, text: text });
    }

    var allSessions = Array.isArray(data.allSessions) ? data.allSessions : [];
    var summaries = Array.isArray(data.summaries) ? data.summaries : [];

    // Streak
    var streak = computeWeeklyStreak(allSessions, data.now ? new Date(data.now) : new Date());
    if (streak >= 8) add('streak_long', 'fire', 'celebrate', streak + '-week stitching streak \u2014 incredible!');
    else if (streak >= 4) add('streak_mid', 'fire', 'celebrate', "You've stitched every week for " + streak + ' weeks straight.');
    else if (streak >= 2) add('streak_short', 'fire', 'encourage', streak + '-week streak going \u2014 keep it up.');

    // Speed trend (compare first 5 vs last 5 sessions if there are >=10)
    if (allSessions.length >= 10) {
      var sorted = allSessions.slice().sort(function (a, b) {
        return new Date(a.startTime || a.date).getTime() - new Date(b.startTime || b.date).getTime();
      });
      function avgSpeed(arr) {
        var st = arr.reduce(function (a, s) { return a + (s.netStitches || 0); }, 0);
        var sec = arr.reduce(function (a, s) { return a + (s.durationSeconds != null ? s.durationSeconds : (s.durationMinutes || 0) * 60); }, 0);
        return sec > 0 ? st / (sec / 3600) : 0;
      }
      var first = avgSpeed(sorted.slice(0, 5));
      var last = avgSpeed(sorted.slice(-5));
      if (first > 0 && last > 0) {
        var change = (last - first) / first;
        if (change >= 0.10) add('speed_up', 'barChart', 'celebrate',
          'Your stitching speed has improved ' + Math.round(change * 100) + '% since you started.');
        else if (change <= -0.15) add('speed_down', 'lightbulb', 'inform',
          'You\u2019ve eased your pace lately \u2014 down ' + Math.round(Math.abs(change) * 100) + '% from your earlier sessions.');
      }
    }

    // Peak hour shift
    if (allSessions.length >= 20) {
      var thirty = new Date((data.now ? new Date(data.now) : new Date()).getTime() - 30 * 86400000);
      var sixty = new Date(thirty.getTime() - 30 * 86400000);
      var recent = allSessions.filter(function (s) {
        return s.startTime && new Date(s.startTime).getTime() >= thirty.getTime();
      });
      var prior = allSessions.filter(function (s) {
        if (!s.startTime) return false;
        var t = new Date(s.startTime).getTime();
        return t >= sixty.getTime() && t < thirty.getTime();
      });
      var peakRecent = getPeakHour(recent);
      var peakPrior = getPeakHour(prior);
      if (peakRecent != null && peakPrior != null && Math.abs(peakRecent - peakPrior) >= 2) {
        var dir = peakRecent > peakPrior ? 'later' : 'earlier';
        add('peak_shift', 'lightbulb', 'inform',
          'You\u2019ve been stitching ' + dir + ' \u2014 your peak shifted from ' + fmtHour(peakPrior) + ' to ' + fmtHour(peakRecent) + '.');
      }
    }

    // Most-neglected project
    var active = summaries.filter(function (p) {
      return !p.isComplete && (p.totalStitches || 0) > 0;
    });
    if (active.length > 1) {
      function lastTouched(p) {
        var s = (p.statsSessions || []);
        if (!s.length) return new Date(p.updatedAt || p.createdAt || 0).getTime();
        var last = s[s.length - 1];
        return new Date(last.startTime || (last.date + 'T12:00:00')).getTime();
      }
      var sortedActive = active.slice().sort(function (a, b) { return lastTouched(a) - lastTouched(b); });
      var oldest = sortedActive[0];
      var days = Math.floor(((data.now ? new Date(data.now).getTime() : Date.now()) - lastTouched(oldest)) / 86400000);
      if (days >= 14) {
        add('neglected', 'lightbulb', 'nudge',
          (oldest.name || 'A project') + " hasn\u2019t been touched in " + days + ' days.');
      }
    }

    // Colour completion velocity
    if (data.colourCompletion && data.colourCompletion.id) {
      var cc = data.colourCompletion;
      if (cc.pct >= 85 && cc.pct < 100) {
        add('colour_close', 'star', 'celebrate',
          'DMC ' + cc.id + ' is ' + cc.pct + '% done \u2014 you\u2019re close to finishing it!');
      }
    }

    // Week-over-week
    if (data.thisWeek && data.lastWeek) {
      var delta = (data.thisWeek.stitches || 0) - (data.lastWeek.stitches || 0);
      if (data.lastWeek.stitches > 0 && delta > 0) {
        var pctW = Math.round(delta / data.lastWeek.stitches * 100);
        if (pctW >= 20) add('wow_up', 'barChart', 'celebrate',
          'You stitched ' + fmtNum(delta) + ' more stitches this week than last \u2014 a ' + pctW + '% increase.');
      }
    }

    // Stash utilisation (Brief D dependency — guard for absence)
    if (data.stash && typeof data.stash === 'object') {
      var ownedKeys = Object.keys(data.stash).filter(function (k) {
        return data.stash[k] && (data.stash[k].owned || 0) > 0;
      });
      if (ownedKeys.length > 0 && summaries.length > 0) {
        // Build set of palette IDs across all projects.
        var usedIds = {};
        for (var pi = 0; pi < summaries.length; pi++) {
          var pal = summaries[pi].palette || [];
          for (var ci = 0; ci < pal.length; ci++) {
            var id = pal[ci] && pal[ci].id;
            if (!id || id === '__skip__' || id === '__empty__') continue;
            // Blends
            if (typeof id === 'string' && id.indexOf('+') !== -1) {
              id.split('+').forEach(function (sub) { usedIds['dmc:' + sub.trim()] = true; });
            } else {
              usedIds['dmc:' + id] = true;
            }
          }
        }
        var unusedOwned = ownedKeys.filter(function (k) { return !usedIds[k]; }).length;
        if (unusedOwned >= 5) {
          add('stash_unused', 'lightbulb', 'nudge',
            'You own ' + ownedKeys.length + ' threads but ' + unusedOwned + " aren\u2019t used in any project yet.");
        }
      }
    }

    // Fun fallback fact when nothing else (so the page is never empty for an active user).
    if (out.length === 0 && allSessions.length > 0) {
      var totalStitchesAll = allSessions.reduce(function (a, s) { return a + (s.netStitches || 0); }, 0);
      // Approx 32 stitches per inch of thread for 14ct fabric, so total inches ≈ stitches * 0.85
      // Convert to metres for fun fact (rough estimate; not calibrated per fabric count).
      var metres = Math.round(totalStitchesAll * 0.022);
      if (metres >= 1) add('fun_thread', 'star', 'inform',
        'You\u2019ve now stitched the equivalent of about ' + fmtNum(metres) + ' metre' + (metres !== 1 ? 's' : '') + ' of thread!');
    }

    // Light shuffle by seed for variety; keep highest-priority items first.
    return out;
  }

  var InsightsEngine = {
    generateInsights: generateInsights,
    generateWeeklySummary: generateWeeklySummary,
    generateProjections: generateProjections,
    computeWeeklyStreak: computeWeeklyStreak,
    buildRhythmMatrix: buildRhythmMatrix,
    getPeakHour: getPeakHour,
    getPeakCell: getPeakCell,
    fmtHour: fmtHour
  };

  global.InsightsEngine = InsightsEngine;
  if (typeof module !== 'undefined' && module.exports) module.exports = InsightsEngine;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
