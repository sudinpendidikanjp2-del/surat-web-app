import type pg from 'pg';
import type { Repos, UnitOfWork } from '@/server/application/ports';
import { executor, transaction, type Db } from './client';
import { attachmentsRepo, confirmationsRepo, dispositionsRepo, lettersInRepo, tasksRepo } from '../repositories/letters-in';
import { lettersOutRepo, templatesRepo } from '../repositories/letters-out';
import { journalRepo } from '../repositories/journal';
import { sessionsRepo, settingsRepo, unitsRepo, usersRepo } from '../repositories/people';
import { dispositionQueries, letterOutQueries, lettersInQueries, taskQueries } from '../queries/lists';
import { insightQueries, reportQueries } from '../queries/insight';
import { instansiRepo, refsRepo } from '../repositories/reference';

/** Semua repositori terikat ke satu pelaksana kueri (pool, atau client dalam transaksi). */
export function createRepos(db: Db): Repos {
  return {
    users: usersRepo(db),
    sessions: sessionsRepo(db),
    units: unitsRepo(db),
    settings: settingsRepo(db),
    journal: journalRepo(db),
    lettersIn: lettersInRepo(db),
    dispositions: dispositionsRepo(db),
    tasks: tasksRepo(db),
    confirmations: confirmationsRepo(db),
    attachments: attachmentsRepo(db),
    lettersOut: lettersOutRepo(db),
    templates: templatesRepo(db),
    refs: refsRepo(db),
    instansi: instansiRepo(db),
    lettersInQueries: lettersInQueries(db),
    dispositionQueries: dispositionQueries(db),
    taskQueries: taskQueries(db),
    letterOutQueries: letterOutQueries(db),
    insightQueries: insightQueries(db),
    reportQueries: reportQueries(db),
  };
}

export function pgUnitOfWork(pool: pg.Pool): UnitOfWork {
  return {
    run: (fn) => transaction(pool, (db) => fn(createRepos(db))),
    read: createRepos(executor(pool)),
  };
}
