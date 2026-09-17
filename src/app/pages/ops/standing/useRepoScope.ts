/**
 * useRepoScope — Standing's repo filter, kept in the URL.
 *
 * `?repo=<name>` is the only state: absent means every repo. Living in the URL
 * makes a scoped view bookmarkable and shareable, and every tap a history
 * entry, so Back undoes a filter the way it undoes any other navigation.
 *
 * Resolution waits for data. Before the first payload lands there is no repo
 * set to match against, and calling `?repo=ops` "unknown" for that half-second
 * would flash a false note over a page that is merely loading.
 */

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { FleetStatus } from '../ralphStatus';
import {
  repoOptions,
  resolveRepoParam,
  type RepoAmbiguity,
  type RepoOption,
  type RepoResolution,
} from './repoScope';

const PARAM = 'repo';

export interface RepoScope {
  options: RepoOption[];
  /** The selected option, or null for every repo. */
  selected: RepoOption | null;
  /** A `?repo=` value the loaded data does not hold. */
  unknown: string | null;
  /** A short `?repo=` value that more than one loaded repo answers to. */
  ambiguous: RepoAmbiguity | null;
  /** Push `?repo=<param>`, or drop the param for null. Other params survive. */
  select: (param: string | null) => void;
}

export function useRepoScope(data: FleetStatus | null): RepoScope {
  const [params, setParams] = useSearchParams();
  const raw = params.get(PARAM);

  const options = useMemo(() => (data ? repoOptions(data) : []), [data]);
  const { selected, unknown, ambiguous } = useMemo<RepoResolution>(
    () =>
      data ? resolveRepoParam(raw, options) : { selected: null, unknown: null, ambiguous: null },
    [data, raw, options],
  );

  const select = useCallback(
    (param: string | null) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        if (param === null) next.delete(PARAM);
        else next.set(PARAM, param);
        return next;
      });
    },
    [setParams],
  );

  return { options, selected, unknown, ambiguous, select };
}
