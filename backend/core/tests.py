from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Mechanic


class EmergencyMechanicRankingTest(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username='tester', password='pass123')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        Mechanic.objects.create(
            name='Top Mechanic', phone='+911234567890', specialization='general',
            location_text='Test Area', latitude=23.2620, longitude=77.4300,
            experience_years=10, service_cost=500, is_available=True, rating=4.9, review_count=25,
        )
        Mechanic.objects.create(
            name='Far Mechanic', phone='+919876543210', specialization='general',
            location_text='Far Area', latitude=23.3800, longitude=77.5000,
            experience_years=4, service_cost=750, is_available=True, rating=4.4, review_count=10,
        )

    def test_emergency_mechanics_return_recommended_top_result(self):
        response = self.client.get('/api/emergency/mechanics/?lat=23.2620&lng=77.4300')
        self.assertEqual(response.status_code, 200)

        data = response.json()
        self.assertGreaterEqual(len(data), 2)
        self.assertIn('topsis_score', data[0])
        self.assertIn('recommendation_reason', data[0])
        self.assertTrue(data[0]['recommendation_reason'])
        self.assertGreaterEqual(float(data[0]['topsis_score']), float(data[1]['topsis_score']))
