import { Router } from 'express';
import {
  getTranscripts,
  getTranscriptById,
  createTranscript,
  updateTranscript,
  deleteTranscript
} from '../controllers/transcriptionController.js';

const router = Router();

router.get('/', getTranscripts);
router.post('/', createTranscript);
router.get('/:id', getTranscriptById);
router.put('/:id', updateTranscript);
router.delete('/:id', deleteTranscript);

export default router;
