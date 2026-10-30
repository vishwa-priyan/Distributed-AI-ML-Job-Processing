"""
Unit tests for safe ML workload handlers and atomic result writers.
"""

import os
import unittest
import pandas as pd
from workers.app.handlers.ml_handlers import HANDLERS
from workers.app.result_writer.atomic_writer import compute_sha256, write_atomic_csv, write_atomic_json

class TestMLHandlers(unittest.TestCase):
    def setUp(self):
        os.makedirs("storage/test_tmp", exist_ok=True)
        self.test_csv = "storage/test_tmp/sample_chunk.csv"
        df = pd.DataFrame({
            'id': range(1, 11),
            'tenure': [12, 24, 36, 48, 60, 6, 18, 30, 42, 54],
            'monthly_charges': [50.0, 65.0, 80.0, 95.0, 110.0, 40.0, 55.0, 70.0, 85.0, 100.0],
            'total_charges': [600.0, 1560.0, 2880.0, 4560.0, 6600.0, 240.0, 990.0, 2100.0, 3570.0, 5400.0],
            'contract_type': [0, 1, 2, 0, 1, 2, 0, 1, 2, 0],
            'payment_method': [0, 1, 2, 3, 0, 1, 2, 3, 0, 1],
            'churn': [0, 1, 0, 1, 0, 1, 0, 1, 0, 1]
        })
        df.to_csv(self.test_csv, index=False)

    def test_csv_batch_inference_handler(self):
        out_path = "storage/test_tmp/inference_out.csv"
        params = {
            "input_path": self.test_csv,
            "output_path": out_path,
            "model_path": "ml/models/customer_churn_rf.joblib"
        }
        res = HANDLERS['csv_batch_inference'](params)
        self.assertEqual(res['status'], 'COMPLETED')
        self.assertEqual(res['records_processed'], 10)
        self.assertTrue(os.path.exists(out_path))

        # Verify columns in generated CSV
        df_out = pd.read_csv(out_path)
        self.assertIn('predicted_label', df_out.columns)

    def test_data_preprocessing_handler(self):
        out_path = "storage/test_tmp/preprocessed_out.csv"
        params = {
            "input_path": self.test_csv,
            "output_path": out_path,
            "scale": "minmax",
            "imputation": "mean"
        }
        res = HANDLERS['data_preprocessing'](params)
        self.assertEqual(res['status'], 'COMPLETED')
        self.assertTrue(os.path.exists(out_path))

    def test_model_evaluation_handler(self):
        out_path = "storage/test_tmp/eval_metrics.json"
        params = {
            "input_path": self.test_csv,
            "output_path": out_path,
            "model_path": "ml/models/customer_churn_rf.joblib",
            "target_column": "churn"
        }
        res = HANDLERS['model_evaluation'](params)
        self.assertEqual(res['status'], 'COMPLETED')
        self.assertIn('accuracy', res['metrics'])
        self.assertIn('confusion_matrix', res['metrics'])

    def test_atomic_writer_checksum(self):
        test_path = "storage/test_tmp/atomic_test.csv"
        df = pd.DataFrame({'col': [1, 2, 3]})
        p, size, sha = write_atomic_csv(df, test_path)
        self.assertTrue(os.path.exists(p))
        self.assertEqual(len(sha), 64) # Valid SHA-256 hex length

if __name__ == '__main__':
    unittest.main()
