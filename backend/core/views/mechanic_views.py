from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.models import Mechanic, EmergencyRequest
from core.serializers import MechanicProfileSerializer, EmergencyRequestSerializer


@api_view(['GET', 'POST', 'PUT'])
@permission_classes([IsAuthenticated])
def mechanic_profile_view(request):
    """GET: return current mechanic profile
       POST/PUT: create or update mechanic profile for current user
    """
    user = request.user
    if user.role != 'mechanic':
        return Response({'detail': 'Not a mechanic account'}, status=status.HTTP_403_FORBIDDEN)

    if request.method == 'GET':
        try:
            mech = user.mechanic_profile
        except Mechanic.DoesNotExist:
            return Response({}, status=status.HTTP_200_OK)
        serializer = MechanicProfileSerializer(mech, context={'request': request})
        return Response(serializer.data)

    data = request.data.copy()
    # ensure name is present
    obj, created = Mechanic.objects.update_or_create(
        user=user,
        defaults={
            'name': data.get('name', user.username),
            'phone': data.get('phone'),
            'specialization': data.get('specialization', 'general'),
            'location_text': data.get('location_text', ''),
            'latitude': data.get('latitude'),
            'longitude': data.get('longitude'),
            'experience_years': data.get('experience_years', 1),
            'service_cost': data.get('service_cost', 500),
            'is_available': data.get('is_available', True),
        }
    )
    serializer = MechanicProfileSerializer(obj, context={'request': request})
    return Response(serializer.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def mechanic_requests_view(request):
    """Return pending emergency requests for mechanics to act on.
       Simple implementation: return all pending requests.
    """
    user = request.user
    if user.role != 'mechanic':
        return Response({'detail': 'Not a mechanic account'}, status=status.HTTP_403_FORBIDDEN)

    qs = EmergencyRequest.objects.filter(status='pending')
    serializer = EmergencyRequestSerializer(qs, many=True, context={'request': request})
    return Response(serializer.data)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def mechanic_request_action_view(request, pk):
    """Mechanic accepts/rejects a request. Body: {"action": "accept"|"reject"}
    """
    user = request.user
    if user.role != 'mechanic':
        return Response({'detail': 'Not a mechanic account'}, status=status.HTTP_403_FORBIDDEN)

    try:
        mech = user.mechanic_profile
    except Mechanic.DoesNotExist:
        return Response({'detail': 'No mechanic profile'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        req = EmergencyRequest.objects.get(pk=pk)
    except EmergencyRequest.DoesNotExist:
        return Response({'detail': 'Request not found'}, status=status.HTTP_404_NOT_FOUND)

    action = request.data.get('action')
    if action == 'accept':
        req.mechanic = mech
        req.status = 'accepted'
        req.save()
    elif action == 'reject':
        req.status = 'rejected'
        req.mechanic = mech
        req.save()
    else:
        return Response({'detail': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)

    serializer = EmergencyRequestSerializer(req, context={'request': request})
    return Response(serializer.data)
