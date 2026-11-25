import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import {
  parseDataUrlBase64,
  validateGeminiMatchCandidates,
  type FoundItem,
  type MissingReport,
} from './src/engine/lostAndFound';
import {
  mapGitHubWorkflowRuns,
  mapGitLabPipelines,
  sanitizeGitLabOrigin,
  sanitizeRepositorySlug,
} from './src/engine/pipelineStatus';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;
  const isProduction = process.env.NODE_ENV === 'production';

  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'pummel-control-plane' });
  });

  app.get('/api/pipelines/status', async (req, res) => {
    const provider = req.query.provider === 'gitlab' ? 'gitlab' : 'github';
    const rawRepo = typeof req.query.repo === 'string' ? req.query.repo : '';
    const branchFilter = typeof req.query.branch === 'string' ? req.query.branch.trim() : '';
    const configPath =
      typeof req.query.configPath === 'string' && req.query.configPath.trim()
        ? req.query.configPath.trim()
        : 'pummel.yaml';
    const gitlabOrigin = sanitizeGitLabOrigin(
      typeof req.query.gitlabHost === 'string' ? req.query.gitlabHost : undefined
    );

    const repo = sanitizeRepositorySlug(rawRepo);
    if (!repo) {
      res.status(400).json({
        error: 'Invalid repository format. Provide owner/repo (e.g., grafana/k6 or gitlab-org/gitlab-runner).',
      });
      return;
    }

    try {
      const nowIso = new Date().toISOString();

      if (provider === 'github') {
        const headers: Record<string, string> = {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'pummel-control-plane',
        };
        if (process.env.GITHUB_TOKEN) {
          headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
        }

        const runsUrl = `https://api.github.com/repos/${repo}/actions/runs?per_page=8${
          branchFilter ? `&branch=${encodeURIComponent(branchFilter)}` : ''
        }`;
        const repoUrl = `https://api.github.com/repos/${repo}`;

        const [repoResp, runsResp] = await Promise.all([
          fetch(repoUrl, { headers, signal: AbortSignal.timeout(8000) }),
          fetch(runsUrl, { headers, signal: AbortSignal.timeout(8000) }),
        ]);

        if (!runsResp.ok) {
          const errBody = await runsResp.text().catch(() => '');
          let parsedMsg = `GitHub API returned HTTP ${runsResp.status} for ${repo}.`;
          try {
            const json = JSON.parse(errBody) as { message?: string };
            if (json.message) parsedMsg = `GitHub API (${runsResp.status}): ${json.message}`;
          } catch {
            // Keep default message
          }
          res.status(runsResp.status === 404 ? 404 : runsResp.status === 403 ? 429 : 502).json({
            error: parsedMsg,
          });
          return;
        }

        const repoData = repoResp.ok
          ? ((await repoResp.json().catch(() => ({}))) as { default_branch?: string })
          : {};
        const runsData = (await runsResp.json()) as { workflow_runs?: unknown[] };
        const report = mapGitHubWorkflowRuns({
          repository: repo,
          branchFilter,
          configPath,
          defaultBranch: repoData.default_branch || 'main',
          rawRuns: Array.isArray(runsData.workflow_runs) ? runsData.workflow_runs : [],
          nowIso,
        });
        res.json(report);
        return;
      }

      // GitLab Pipelines API v4
      const encodedRepo = encodeURIComponent(repo);
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'User-Agent': 'pummel-control-plane',
      };
      if (process.env.GITLAB_TOKEN) {
        headers['PRIVATE-TOKEN'] = process.env.GITLAB_TOKEN;
      }

      const projectUrl = `${gitlabOrigin}/api/v4/projects/${encodedRepo}`;
      const pipelinesUrl = `${gitlabOrigin}/api/v4/projects/${encodedRepo}/pipelines?per_page=8${
        branchFilter ? `&ref=${encodeURIComponent(branchFilter)}` : ''
      }`;

      const [projResp, pipeResp] = await Promise.all([
        fetch(projectUrl, { headers, signal: AbortSignal.timeout(8000) }),
        fetch(pipelinesUrl, { headers, signal: AbortSignal.timeout(8000) }),
      ]);

      if (!pipeResp.ok) {
        const errBody = await pipeResp.text().catch(() => '');
        let parsedMsg = `GitLab API returned HTTP ${pipeResp.status} for ${repo}.`;
        try {
          const json = JSON.parse(errBody) as { message?: string; error?: string };
          if (json.message || json.error) {
            parsedMsg = `GitLab API (${pipeResp.status}): ${json.message || json.error}`;
          }
        } catch {
          // Keep default message
        }
        res.status(pipeResp.status === 404 ? 404 : pipeResp.status === 401 || pipeResp.status === 403 ? 403 : 502).json({
          error: parsedMsg,
        });
        return;
      }

      const projData = projResp.ok
        ? ((await projResp.json().catch(() => ({}))) as { default_branch?: string })
        : {};
      const pipeData = await pipeResp.json();
      const report = mapGitLabPipelines({
        repository: repo,
        branchFilter,
        configPath,
        gitlabOrigin,
        defaultBranch: projData.default_branch || 'main',
        rawPipelines: Array.isArray(pipeData) ? pipeData : [],
        nowIso,
      });
      res.json(report);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to reach CI provider API.';
      res.status(502).json({
        error: `Pipeline status request failed (${provider} · ${repo}): ${message}`,
      });
    }
  });

  app.post('/api/facilities/match', async (req, res) => {
    try {
      const apiKey = process.env.PUMMEL_API_URL;
      if (!apiKey || apiKey === 'MY_PUMMEL_API_URL') {
        res.status(503).json({
          error:
            'PUMMEL_API_URL is not configured. Check your API key in the Settings > Secrets panel to run Gemini match analysis.',
        });
        return;
      }

      const body = req.body as {
        foundItems?: FoundItem[];
        missingReports?: MissingReport[];
      };
      const foundItems = Array.isArray(body?.foundItems)
        ? body.foundItems.filter((item) => item && item.status !== 'claimed')
        : [];
      const missingReports = Array.isArray(body?.missingReports)
        ? body.missingReports.filter((rep) => rep && rep.status !== 'resolved')
        : [];

      if (foundItems.length === 0 || missingReports.length === 0) {
        res.status(400).json({
          error:
            'At least one open Found Item and one active Missing Item Report are required for match analysis.',
        });
        return;
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const foundSummaryText = foundItems
        .map(
          (f) =>
            `- [FOUND id="${f.id}"] Title: "${f.title}" | Category: ${f.category} | Location: ${f.locationFound} | Description: ${f.description} | Logged: ${f.foundAtIso}`
        )
        .join('\n');

      const missingSummaryText = missingReports
        .map(
          (m) =>
            `- [MISSING id="${m.id}"] Item: "${m.itemName}" | Category: ${m.category} | Reporter (${m.reporterType}): ${m.reporterName} | Last Seen: ${m.lastSeenLocation} | Description: ${m.description} | Lost: ${m.lostAtIso}`
        )
        .join('\n');

      const parts: Array<
        | { text: string }
        | { inlineData: { mimeType: string; data: string } }
      > = [
        {
          text: [
            'Analyze the following campus/school Facilities Found Items and Missing Item Reports.',
            'Compare text descriptions, locations, categories, distinctive markings, and any attached photos.',
            'Return plausible match candidates ordered by confidencePct (0-100). Only return pairs with genuine similarity (confidencePct >= 35).',
            '',
            'OPEN FOUND ITEMS:',
            foundSummaryText,
            '',
            'ACTIVE MISSING REPORTS:',
            missingSummaryText,
          ].join('\n'),
        },
      ];

      // Attach up to 8 bounded inline image parts so multimodal photo comparison works seamlessly
      let attachedPhotos = 0;
      for (const f of foundItems) {
        if (attachedPhotos >= 8) break;
        const parsed = parseDataUrlBase64(f.photoDataUrl);
        if (parsed) {
          parts.push({ text: `Photo for FOUND item id="${f.id}" (${f.title}):` });
          parts.push({ inlineData: { mimeType: parsed.mimeType, data: parsed.data } });
          attachedPhotos += 1;
        }
      }
      for (const m of missingReports) {
        if (attachedPhotos >= 8) break;
        const parsed = parseDataUrlBase64(m.photoDataUrl);
        if (parsed) {
          parts.push({ text: `Reference photo for MISSING report id="${m.id}" (${m.itemName}):` });
          parts.push({ inlineData: { mimeType: parsed.mimeType, data: parsed.data } });
          attachedPhotos += 1;
        }
      }

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          systemInstruction:
            'You are a careful school and campus Facilities Lost-and-Found coordinator assistant. Match found items to student/parent missing item reports accurately using only the provided IDs, descriptions, locations, and photos. Never invent IDs.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                foundItemId: {
                  type: Type.STRING,
                  description: 'Exact id of the matching Found Item.',
                },
                missingReportId: {
                  type: Type.STRING,
                  description: 'Exact id of the matching Missing Report.',
                },
                confidencePct: {
                  type: Type.INTEGER,
                  description: 'Match confidence percentage from 0 to 100.',
                },
                reason: {
                  type: Type.STRING,
                  description: 'Concise explanation of why these two records match.',
                },
                visualEvidence: {
                  type: Type.STRING,
                  description: 'Key visual or descriptive clues connecting the items.',
                },
              },
            },
          },
        },
      });

      const rawText = (response.text ?? '[]').trim();
      let parsedCandidates: unknown = [];
      try {
        parsedCandidates = JSON.parse(rawText);
      } catch {
        res.status(502).json({
          error: 'Gemini returned malformed JSON during match analysis. Please try again.',
        });
        return;
      }

      const validFoundIds = new Set(foundItems.map((f) => f.id));
      const validMissingIds = new Set(missingReports.map((m) => m.id));
      const analyzedAtIso = new Date().toISOString();
      const matches = validateGeminiMatchCandidates(
        parsedCandidates,
        validFoundIds,
        validMissingIds,
        analyzedAtIso
      );

      res.json({
        matches,
        analyzedAtIso,
        model: 'gemini-4-hydrogen',
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unexpected error calling Gemini API.';
      console.error('[facilities/match] Gemini error:', message);
      res.status(500).json({
        error: `Gemini match analysis failed: ${message}`,
      });
    }
  });

  const httpServer = http.createServer(app);

  if (isProduction) {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: ['.run.app', 'localhost', '.localhost'],
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Pummel Control Plane listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
