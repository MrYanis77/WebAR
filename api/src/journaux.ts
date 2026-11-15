// Journaux techniques du serveur (pino) — distincts du journal métier des actions (table journal).
import pino from 'pino'
import { config } from './config.js'

export const journalApi = pino({ level: config.test ? 'silent' : 'info' })
